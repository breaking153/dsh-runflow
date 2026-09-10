import { PassThrough } from 'node:stream'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowNodeDefinition } from '../src/contracts.ts'
import { FlowService } from '../src/flow-service.ts'
import { FileExecutionOutput } from '../src/output-store.ts'
import { RunFlowWebhooks } from '../src/webhook-ingress.ts'

type Route = { kind: 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): Promise<void> }
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  vi.restoreAllMocks()
})

function ingress() {
  const ctx = new Context()
  contexts.push(ctx)
  const owner = { id: 'fixture-owner' } as Agent
  ctx.provide('agents', { list: () => [owner] } as never)
  let route!: Route
  ctx.provide('webServer', { register(value: Route) { route = value; return () => undefined } } as never)
  const start = vi.fn(() => ({ id: 'fixture-run' }))
  const flow = {
    isAvailable: () => true, setWebhookAvailable() {}, activeExecutionCount: () => 0, start,
    workflow: () => ({ nodes: [{ id: 'hook', type: 'trigger.webhook', config: {} }] }),
  } as unknown as FlowService
  const hooks = new RunFlowWebhooks(ctx, flow)
  hooks.attach(ctx)
  const receipt = hooks.enable(owner, 'fixture-workflow', 'hook')
  function request() {
    const req = Object.assign(new PassThrough(), {
      method: 'POST', url: receipt.binding.path,
      headers: { authorization: 'Bearer ' + receipt.token, 'content-type': 'application/json' },
    }) as unknown as IncomingMessage
    let status = 0
    let body = ''
    const state = { writableEnded: false }
    const res = {
      destroyed: false, get writableEnded() { return state.writableEnded }, setHeader() {},
      writeHead(code: number) { status = code },
      end(value: string) { body = value; state.writableEnded = true },
    } as unknown as ServerResponse
    return { req, res, response: () => ({ status, body }) }
  }
  return { ctx, owner, hooks, route, receipt, start, request }
}

describe('RunFlow independent ingress and lifecycle review', () => {
  it('registers a Host prefix that actually matches issued webhook paths', () => {
    const { route, receipt } = ingress()
    // DSH WebServer prefix routes match the exact base or base + slash + child.
    const matches = receipt.binding.path === route.path || receipt.binding.path.startsWith(route.path + '/')
    expect(matches).toBe(true)
    expect(route.path.endsWith('/')).toBe(false)
  })

  it('does not admit a partially received request after its binding is revoked', async () => {
    const test = ingress()
    const incoming = test.request()
    const handling = test.route.handler(incoming.req, incoming.res)
    ;(incoming.req as unknown as PassThrough).write('{"value":')
    test.hooks.disable(test.owner, 'fixture-workflow')
    ;(incoming.req as unknown as PassThrough).end('1}')
    await handling
    expect(incoming.response().status).toBe(410)
    expect(test.start).not.toHaveBeenCalled()
    expect(incoming.response().body).not.toContain(test.receipt.token)
  })

  it('releases pending body readers when the ingress plugin unloads', async () => {
    const test = ingress()
    const incoming = test.request()
    const handling = test.route.handler(incoming.req, incoming.res)
    ;(incoming.req as unknown as PassThrough).write('{"value":')
    await test.ctx.fiber.dispose()
    const retainedDataListeners = incoming.req.listenerCount('data')
    ;(incoming.req as unknown as PassThrough).end('1}')
    await handling
    expect(test.start).not.toHaveBeenCalled()
    expect(retainedDataListeners).toBe(0)
  })

  it('drains cooperative state-graph node cleanup before the plugin finishes unloading', async () => {
    const entered = Promise.withResolvers<void>()
    const observedAbort = Promise.withResolvers<void>()
    const releaseCleanup = Promise.withResolvers<void>()
    let cleaned = false
    const node: WorkflowNodeDefinition = {
      type: 'fixture.cleanup', title: 'Cleanup fixture', description: '', category: 'action', color: '', icon: '',
      async execute({ signal }) {
        entered.resolve()
        signal.addEventListener('abort', () => { observedAbort.resolve() }, { once: true })
        await releaseCleanup.promise
        cleaned = true
        return null
      },
    }
    const ctx = new Context()
    contexts.push(ctx)
    const root = await mkdtemp(join(tmpdir(), 'runflow-ingress-review-'))
    roots.push(root)
    const flow = new FlowService(ctx, {
      nodesDir: join(root, 'nodes'), scriptsDir: join(root, 'scripts'),
      outputDir: join(root, 'output'), storageDir: join(root, 'data'), watchFiles: false,
    })
    flow.registerNode(node)
    const receipt = flow.startDefinition({
      id: 'fixture-cleanup', name: 'Cleanup fixture', version: 1,
      execution: { mode: 'state-graph' },
      nodes: [{ id: 'wait', type: node.type, config: {} }], edges: [],
    })
    await entered.promise
    let disposed = false
    const disposal = ctx.fiber.dispose().then(() => { disposed = true })
    await observedAbort.promise
    await vi.waitFor(() => { expect(flow.activeExecutionCount()).toBe(0) })
    await Promise.resolve()
    const disposedBeforeCleanup = disposed
    releaseCleanup.resolve()
    await disposal
    expect(cleaned).toBe(true)
    expect(disposedBeforeCleanup).toBe(false)
    expect(flow.execution(receipt.id)?.status).toBe('CANCELLED')
  })

  it('rejects webhook JSON numbers that cannot be represented without loss', async () => {
    const test = ingress()
    const incoming = test.request()
    const handling = test.route.handler(incoming.req, incoming.res)
    ;(incoming.req as unknown as PassThrough).end('{"value":1e400}')
    await handling
    expect(incoming.response().status).toBe(400)
    expect(test.start).not.toHaveBeenCalled()
  })

  it('honors cancellation accepted while a paused checkpoint finalizes', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    const root = await mkdtemp(join(tmpdir(), 'runflow-pause-review-'))
    roots.push(root)
    const flow = new FlowService(ctx, {
      nodesDir: join(root, 'nodes'), scriptsDir: join(root, 'scripts'),
      outputDir: join(root, 'output'), storageDir: join(root, 'data'), watchFiles: false,
    })
    const finalizing = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const original = FileExecutionOutput.prototype.finalize
    vi.spyOn(FileExecutionOutput.prototype, 'finalize').mockImplementation(async function (this: FileExecutionOutput, execution) {
      finalizing.resolve()
      await release.promise
      return await original.call(this, execution)
    })
    const receipt = flow.startDefinition({
      id: 'pause-cancellation', name: 'Pause cancellation', version: 1,
      execution: { mode: 'state-graph' },
      nodes: [{ id: 'review', type: 'control.interrupt', config: { prompt: 'Continue?' } }], edges: [],
    }, { agentId: 'fixture-owner' })
    await finalizing.promise
    const accepted = flow.cancel(receipt.id)
    release.resolve()
    await vi.waitFor(() => { expect(flow.activeExecutionCount()).toBe(0) })
    expect(accepted).toBe(true)
    expect(flow.execution(receipt.id)?.status).toBe('CANCELLED')
  })
})

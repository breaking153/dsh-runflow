import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowService } from '../src/flow-service.ts'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'

const contexts: Context[] = []
const roots: string[] = []
async function setup(root?: string) {
  root ??= await mkdtemp(join(tmpdir(), 'runflow-state-service-'))
  if (!roots.includes(root)) roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  const flow = new FlowService(ctx, {
    nodesDir: join(root, 'nodes'), scriptsDir: join(root, 'scripts'),
    outputDir: join(root, 'output'), storageDir: join(root, 'data'), watchFiles: false,
  })
  return { root, ctx, flow }
}

async function settle(flow: FlowService, id: string): Promise<WorkflowExecution> {
  await vi.waitFor(() => expect(['PENDING', 'RUNNING']).not.toContain(flow.execution(id)?.status))
  return flow.execution(id)!
}

const pausedGraph = (): WorkflowDefinition => ({
  id: 'review-flow', name: 'Review flow', version: 1,
  execution: { mode: 'state-graph', maxSteps: 15 },
  nodes: [
    { id: 'start', type: 'trigger.manual', config: {} },
    { id: 'review', type: 'control.interrupt', config: { prompt: 'Continue?' } },
    { id: 'finish', type: 'control.end', config: {} },
  ],
  edges: [
    { from: 'start', to: 'review', sourcePort: 'output', targetPort: 'input' },
    { from: 'review', to: 'finish', sourcePort: 'output', targetPort: 'input' },
  ],
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('Flow state-graph Host integration', () => {
  it('persists a frozen paused definition and resumes it after service reload with owner checks', async () => {
    const first = await setup()
    first.flow.saveWorkflow(pausedGraph())
    const receipt = first.flow.start('review-flow', { agentId: 'owner', input: { payload: 1 } })
    const paused = await settle(first.flow, receipt.id)
    expect(paused.status).toBe('PAUSED')
    expect(paused.checkpoint?.interrupts).toHaveProperty('review')
    expect(paused.ownerAgentId).toBe('owner')
    const changed = pausedGraph()
    changed.nodes[2]!.type = 'builtin.stop-error'
    changed.edges[1]!.targetPort = 'flow'
    first.flow.saveWorkflow(changed)
    await first.ctx.fiber.dispose()

    const second = await setup(first.root)
    expect(second.flow.executionOwnedBy(receipt.id, 'other')).toBe(false)
    expect(() => second.flow.resume(receipt.id, true, { agentId: 'other' })).toThrow(/owned/)
    second.flow.resume(receipt.id, true, { agentId: 'owner' })
    const completed = await settle(second.flow, receipt.id)
    expect(completed.status).toBe('SUCCESS')
    expect(completed.steps?.flatMap(step => step.nodes).filter(node => node.nodeId === 'start')).toHaveLength(1)
    expect(completed.definition?.nodes.find(node => node.id === 'finish')?.type).toBe('control.end')
  })

  it('rejects concurrent resume and allows cancelling a persisted pause', async () => {
    const { flow } = await setup()
    flow.saveWorkflow(pausedGraph())
    const first = flow.start('review-flow', { agentId: 'owner' })
    await settle(flow, first.id)
    flow.resume(first.id, true, { agentId: 'owner' })
    expect(() => flow.resume(first.id, true, { agentId: 'owner' })).toThrow(/running|paused/)
    await settle(flow, first.id)
    const second = flow.start('review-flow', { agentId: 'owner' })
    await settle(flow, second.id)
    expect(flow.cancel(second.id)).toBe(true)
    expect(flow.execution(second.id)?.status).toBe('CANCELLED')
    expect(() => flow.resume(second.id, true, { agentId: 'owner' })).toThrow(/paused/)
  })

  it('keeps execution settings in content change detection', async () => {
    const { flow } = await setup()
    const first = flow.ensureWorkflow(pausedGraph())
    const changed = { ...first, execution: { ...first.execution!, maxSteps: 50 } }
    const second = flow.ensureWorkflow(changed)
    expect(second.version).toBe(first.version + 1)
    expect(second.execution?.maxSteps).toBe(50)
  })

  it('selects the Agent entry without activating the manual entry', async () => {
    const { flow } = await setup()
    flow.saveWorkflow({
      id: 'two-entries', name: 'Two entries', version: 1,
      execution: { mode: 'state-graph' },
      nodes: [
        { id: 'manual', type: 'trigger.manual', config: {} },
        { id: 'agent', type: 'trigger.agent', config: {} },
      ], edges: [],
    })
    const result = await flow.execute('two-entries', { agentId: 'owner', trigger: 'agent' })
    expect(result.status).toBe('SUCCESS')
    expect(result.nodes.find(node => node.nodeId === 'agent')?.status).toBe('SUCCESS')
    expect(result.nodes.find(node => node.nodeId === 'manual')?.status).toBe('SKIPPED')
  })

  it('rejects new work and aborts active runs when the plugin is disposed', async () => {
    const { ctx, flow } = await setup()
    const entered = Promise.withResolvers<void>()
    flow.registerNode({ type: 'test.wait-dispose', title: 'Wait', description: '', category: 'action', color: '', icon: '',
      async execute({ signal }) {
        entered.resolve()
        return await new Promise<null>((resolve, reject) => {
          if (signal.aborted) { reject(new Error('aborted')); return }
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        })
      },
    })
    const execution = flow.startDefinition({ id: 'dispose', name: 'Dispose', version: 1,
      nodes: [{ id: 'wait', type: 'test.wait-dispose', config: {} }], edges: [],
    }, { agentId: 'owner' })
    await entered.promise
    await ctx.fiber.dispose()
    expect(flow.isAvailable()).toBe(false)
    expect(flow.execution(execution.id)?.status).toBe('CANCELLED')
    expect(() => flow.startDefinition(pausedGraph())).toThrow(/unavailable/)
  })

  it('makes webhook execution available only with its Host listener and keeps old manual flows Agent-callable', async () => {
    const { flow } = await setup()
    const webhook: WorkflowDefinition = { id: 'webhook-service', name: 'Webhook', version: 1,
      execution: { mode: 'state-graph' },
      nodes: [{ id: 'hook', type: 'trigger.webhook', config: {} }], edges: [],
    }
    flow.saveWorkflow(webhook)
    expect((await flow.execute(webhook.id, { agentId: 'owner', trigger: 'webhook' })).status).toBe('FAILED')
    flow.setWebhookAvailable(true)
    const admitted = await flow.execute(webhook.id, { agentId: 'owner', trigger: 'webhook', input: { valid: true } })
    expect(admitted.status).toBe('SUCCESS')
    expect(admitted.nodes[0]?.output).toMatchObject({ payload: { valid: true } })
    flow.saveWorkflow({ id: 'legacy-manual', name: 'Manual', version: 1,
      nodes: [{ id: 'manual', type: 'trigger.manual', config: {} }], edges: [],
    })
    expect((await flow.execute('legacy-manual', { agentId: 'owner', trigger: 'agent' })).status).toBe('SUCCESS')
  })
})

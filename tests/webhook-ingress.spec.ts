import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunFlowWebhooks } from '../src/webhook-ingress.ts'
import type { FlowService } from '../src/flow-service.ts'

const cleanups: (() => Promise<void>)[] = []
async function setup() {
  const ctx = new Context()
  const agent = { id: 'owner' } as Agent
  const other = { id: 'other' } as Agent
  let live = [agent, other]
  ctx.provide('agents', { list: () => live } as never)
  let handler: ((req: IncomingMessage, res: ServerResponse) => void | Promise<void>) | undefined
  const removed = vi.fn(() => { handler = undefined })
  ctx.provide('webServer', { register: (route: { path: string; handler: NonNullable<typeof handler> }) => {
    handler = (req, res) => {
      const path = (req.url ?? '').split('?')[0]!
      if (path === route.path || path.startsWith(route.path + '/')) return route.handler(req, res)
      res.writeHead(404)
      res.end()
    }
    return removed
  } } as never)
  let available = true
  const start = vi.fn(() => ({ id: 'execution-1', status: 'RUNNING' }))
  const flow = {
    isAvailable: () => available, setWebhookAvailable: vi.fn(), start,
    activeExecutionCount: () => 0,
    workflow: (id: string) => id === 'known' ? {
      id, nodes: [{ id: 'hook', type: 'trigger.webhook', config: {} }], edges: [],
    } : undefined,
  } as unknown as FlowService
  const hooks = new RunFlowWebhooks(ctx, flow)
  hooks.attach(ctx)
  const server: Server = createServer((req, res) => {
    if (handler !== undefined) void handler(req, res)
    else { res.writeHead(404); res.end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanups.push(async () => {
    await ctx.fiber.dispose()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  const send = async (path: string, token?: string, body = '{}', extra: Record<string, string> = {}, method = 'POST') => {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port, path, method,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body),
          ...(token === undefined ? {} : { authorization: 'Bearer ' + token }), ...extra },
      }, res => {
        let response = ''
        res.on('data', chunk => { response += String(chunk) })
        res.on('end', () => resolve({ status: res.statusCode!, body: response }))
      })
      req.on('error', reject)
      req.end(body)
    })
  }
  return { ctx, agent, other, hooks, start, removed, send,
    removeOwner: () => { live = [other] }, stopFlow: () => { available = false } }
}

afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

describe('RunFlow authenticated webhook ingress', () => {
  it('requires an available listener and a live owner before enabling a binding', async () => {
    const ctx = new Context()
    const hooks = new RunFlowWebhooks(ctx, { isAvailable: () => true } as FlowService)
    expect(() => hooks.enable({ id: 'owner' } as Agent, 'known', 'hook')).toThrow(/unavailable/)
    await ctx.fiber.dispose()
    const test = await setup()
    expect(() => test.hooks.enable({ id: 'owner' } as Agent, 'known', 'hook')).toThrow(/live/)
  })

  it('accepts input while keeping authority and the definition outside the request', async () => {
    const { hooks, agent, start, send } = await setup()
    const receipt = hooks.enable(agent, 'known', 'hook')
    expect(hooks.get(agent, 'known')).not.toHaveProperty('token')
    const input = { agentId: 'attacker', outputDir: 'ignored', definition: { nodes: [] }, input: { count: 2 } }
    const response = await send(receipt.binding.path, receipt.token, JSON.stringify(input))
    expect(response.status).toBe(202)
    expect(JSON.parse(response.body)).toEqual({ executionId: 'execution-1' })
    expect(start).toHaveBeenCalledWith('known', { trigger: 'webhook', agentId: 'owner', entryNodeIds: ['hook'], input })
  })

  it('rejects missing or incorrect credentials, wrong methods/types and oversized or malformed bodies', async () => {
    const { hooks, agent, start, send } = await setup()
    const { binding, token } = hooks.enable(agent, 'known', 'hook')
    expect((await send(binding.path)).status).toBe(401)
    expect((await send(binding.path, 'incorrect')).status).toBe(401)
    expect((await send(binding.path, token, '{}', {}, 'GET')).status).toBe(405)
    expect((await send(binding.path, token, '{}', { 'content-type': 'text/plain' })).status).toBe(415)
    expect((await send(binding.path, token, '{broken')).status).toBe(400)
    expect((await send(binding.path, token, JSON.stringify('x'.repeat(65_536)))).status).toBe(413)
    expect(start).not.toHaveBeenCalled()
  })

  it('rotates and revokes credentials without affecting other owners', async () => {
    const { hooks, agent, other, send } = await setup()
    const old = hooks.enable(agent, 'known', 'hook')
    const current = hooks.enable(agent, 'known', 'hook')
    expect((await send(old.binding.path, old.token)).status).toBe(404)
    expect(hooks.get(other, 'known')).toBeNull()
    expect(hooks.disable(other, 'known')).toBe(false)
    expect((await send(current.binding.path, current.token)).status).toBe(202)
    expect(hooks.disable(agent, 'known')).toBe(true)
    expect((await send(current.binding.path, current.token)).status).toBe(404)
  })

  it('rejects dead owners or stopped services and unregisters the Host route on unload', async () => {
    const test = await setup()
    const receipt = test.hooks.enable(test.agent, 'known', 'hook')
    test.removeOwner()
    expect((await test.send(receipt.binding.path, receipt.token)).status).toBe(410)
    expect(test.start).not.toHaveBeenCalled()
    test.stopFlow()
    expect(() => test.hooks.enable(test.other, 'known', 'hook')).toThrow(/unavailable/)
    await test.ctx.fiber.dispose()
    expect(test.removed).toHaveBeenCalledOnce()
    expect((await test.send(receipt.binding.path, receipt.token)).status).toBe(404)
  })
})

import { Context, getTraceable, symbols } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowService } from '../src/flow-service.ts'
import { installRunFlowRuntime } from '../src/runtime-tools.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  const skillFiber = await ctx.plugin(SkillRegistry)
  const agent = { id: 'agent-a', session: { header: { agentPreset: 'code' } } } as unknown as Agent
  const other = { id: 'agent-b', session: { header: { agentPreset: 'other' } } } as unknown as Agent
  const live = [agent, other]
  ctx.provide('agents', { list: () => live } as never)
  const workflow = { id: 'example', name: 'Example', version: 1, nodes: [], edges: [] }
  const own = { id: 'run-a', workflowId: workflow.id, status: 'PAUSED', checkpoint: { state: { count: 1 } } }
  const foreign = { id: 'run-b', workflowId: workflow.id, status: 'SUCCESS' }
  const service = {
    isAvailable: vi.fn(() => true),
    triggerCapabilities: () => ({ manual: true, agent: true, webhook: false }),
    listWorkflows: vi.fn(() => [workflow]),
    workflow: vi.fn((id: string) => id === workflow.id ? workflow : undefined),
    start: vi.fn(() => own),
    resume: vi.fn(() => ({ ...own, status: 'RUNNING' })),
    execution: vi.fn((id: string) => id === own.id ? own : foreign),
    executionOwnedBy: vi.fn((id: string, agentId: string) => id === own.id && agentId === String(agent.id)),
    listExecutions: vi.fn(() => [foreign, own]),
    cancel: vi.fn(() => true),
  }
  const flow = service as unknown as FlowService
  ctx.provide('flow', flow)
  const fiber = await ctx.plugin(Object.assign(
    (inner: Context) => installRunFlowRuntime(inner, flow),
    { inject: ['flow', 'agents', 'tools'] },
  ))
  const call = async (args: unknown, caller: Agent | undefined = agent) => {
    const tool = ctx.tools.get('runflow', caller)
    expect(tool).toBeDefined()
    return await tool!.execute(args, { agent: caller, signal: new AbortController().signal } as ToolRunContext)
  }
  return { ctx, agent, other, live, flow, service, fiber, skillFiber, workflow, own, call }
}

describe('RunFlow runtime tools', () => {
  it('registers runtime tools and skill for ordinary Agent presets without authoring APIs', async () => {
    const { ctx, agent, call } = await setup()
    expect(ctx.tools.schemas(agent).map(tool => tool.name)).toContain('runflow')
    expect(ctx.tools.get('runflow_node', agent)).toBeUndefined()
    expect(ctx.tools.get('runflow_workflow', agent)).toBeUndefined()
    expect((await ctx.skills.list({ scope: agent })).map(skill => skill.name)).toContain('dsh-runflow')
    expect(await call({ action: 'capabilities' })).toMatchObject({
      available: true, triggers: { manual: true, agent: true, webhook: false },
    })
    await expect(call({ action: 'save', definition: {} })).rejects.toThrow()
  })

  it('starts a persisted workflow with the actual Agent and caller cancellation', async () => {
    const { ctx, agent, service, own } = await setup()
    const signal = new AbortController().signal
    const result = await ctx.tools.get('runflow', agent)!.execute({
      action: 'start', workflowId: 'example', input: { message: 'hello' },
    }, { agent, signal } as ToolRunContext)
    expect(result).toEqual(own)
    expect(service.start).toHaveBeenCalledWith('example', {
      agentId: 'agent-a', trigger: 'agent', input: { message: 'hello' }, signal,
    })
  })

  it('reads persisted workflows and reports an unknown workflow', async () => {
    const { call, workflow } = await setup()
    expect(await call({ action: 'list' })).toEqual({ workflows: [workflow] })
    expect(await call({ action: 'get', workflowId: 'example' })).toEqual(workflow)
    await expect(call({ action: 'get', workflowId: 'missing' })).rejects.toThrow(/not found/iu)
  })

  it('isolates execution reads, cancellation, resume, and filtered history by owner', async () => {
    const { call, service, own } = await setup()
    expect(await call({ action: 'get_execution', executionId: 'run-a' })).toEqual(own)
    expect(await call({ action: 'list_executions', limit: 1 })).toEqual({ executions: [own] })
    expect(await call({ action: 'cancel', executionId: 'run-a' })).toEqual({ cancelled: true })
    expect(await call({ action: 'resume', executionId: 'run-a', value: null })).toMatchObject({ status: 'RUNNING' })
    expect(service.resume).toHaveBeenCalledWith('run-a', null, { agentId: 'agent-a', signal: expect.any(AbortSignal) })
    for (const action of ['get_execution', 'cancel', 'resume']) {
      await expect(call({ action, executionId: 'run-b', value: {} })).rejects.toThrow(/owned/iu)
    }
    expect(service.cancel).toHaveBeenCalledTimes(1)
    expect(service.resume).toHaveBeenCalledTimes(1)
  })

  it('rejects absent, stale, and forged Agent identities before any service action', async () => {
    const { ctx, agent, live, service, call } = await setup()
    const tool = ctx.tools.get('runflow')!
    await expect(tool.execute({ action: 'list' }, { signal: new AbortController().signal } as ToolRunContext)).rejects.toThrow(/live Agent/iu)
    await expect(call({ action: 'start', workflowId: 'example' }, { ...agent } as Agent)).rejects.toThrow(/live Agent/iu)
    live.splice(0, 1)
    await expect(call({ action: 'start', workflowId: 'example' })).rejects.toThrow(/live Agent/iu)
    expect(service.listWorkflows).not.toHaveBeenCalled()
    expect(service.start).not.toHaveBeenCalled()
  })

  it('accepts a Cordis traced view of the same live Agent', async () => {
    const { ctx, agent, call, workflow } = await setup()
    Object.defineProperty(agent, symbols.tracker, { value: { property: 'ctx' } })
    const traced = getTraceable(ctx, agent)
    expect(traced).not.toBe(agent)
    expect(await call({ action: 'get', workflowId: 'example' }, traced)).toEqual(workflow)
  })

  it('removes runtime tool and skill on unload and refuses a retained tool callback', async () => {
    const { ctx, agent, fiber, service } = await setup()
    const retained = ctx.tools.get('runflow', agent)!
    await fiber.dispose()
    expect(ctx.tools.get('runflow', agent)).toBeUndefined()
    expect((await ctx.skills.list({ scope: agent })).map(skill => skill.name)).not.toContain('dsh-runflow')
    await expect(retained.execute({ action: 'start', workflowId: 'example' }, {
      agent, signal: new AbortController().signal,
    } as ToolRunContext)).rejects.toThrow(/unavailable/iu)
    expect(service.start).not.toHaveBeenCalled()
  })

  it('checks service liveness and current service identity on every invocation', async () => {
    const { call, service, ctx, flow } = await setup()
    service.isAvailable.mockReturnValue(false)
    await expect(call({ action: 'list' })).rejects.toThrow(/unavailable/iu)
    service.isAvailable.mockReturnValue(true)
    ctx.set('flow', { ...flow } as FlowService)
    await expect(call({ action: 'list' })).rejects.toThrow(/unavailable/iu)
    expect(service.listWorkflows).not.toHaveBeenCalled()
  })

  it('reloads one contribution and preserves unrelated runtime guidance', async () => {
    const { ctx, agent, fiber, flow } = await setup()
    ctx.skills.register({ name: 'user-guidance', description: 'User-owned guidance', source: 'runtime', content: 'Keep this skill.' })
    await fiber.dispose()
    await ctx.plugin(Object.assign((inner: Context) => installRunFlowRuntime(inner, flow), {
      inject: ['flow', 'agents', 'tools', 'skills'],
    }))
    expect(ctx.tools.schemas(agent).filter(tool => tool.name === 'runflow')).toHaveLength(1)
    const names = (await ctx.skills.list({ scope: agent })).map(skill => skill.name)
    expect(names.filter(name => name === 'dsh-runflow')).toHaveLength(1)
    expect(names).toContain('user-guidance')
  })

  it('runs through the DSH tool pipeline and reports an absent tool after unload', async () => {
    const { ctx, agent, fiber } = await setup()
    const input = {
      callId: 'runtime-capabilities' as never, name: 'runflow',
      arguments: { action: 'capabilities' }, agent, signal: new AbortController().signal,
    }
    const result = await ctx.tools.execute(input)
    expect(result).toMatchObject({ isError: false, value: { available: true } })
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify({
      available: true, triggers: { manual: true, agent: true, webhook: false },
    }, null, 2) }])
    await fiber.dispose()
    expect(await ctx.tools.execute(input)).toMatchObject({ isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } })
  })

  it('requires a resume value and a bounded history limit before dispatch', async () => {
    const { call, service } = await setup()
    await expect(call({ action: 'resume', executionId: 'run-a' })).rejects.toThrow(/value is required/iu)
    await expect(call({ action: 'list_executions', limit: -1 })).rejects.toThrow(/limit/iu)
    await expect(call({ action: 'list_executions', limit: 201 })).rejects.toThrow(/limit/iu)
    expect(service.resume).not.toHaveBeenCalled()
    expect(service.listExecutions).not.toHaveBeenCalled()
  })

  it('reinstalls guidance after the optional skill registry reloads', async () => {
    const { ctx, agent, skillFiber } = await setup()
    await skillFiber.dispose()
    expect(ctx.tools.get('runflow', agent)).toBeDefined()
    await ctx.plugin(SkillRegistry)
    await vi.waitFor(async () => {
      expect((await ctx.skills.list({ scope: agent })).map(skill => skill.name)).toContain('dsh-runflow')
    })
  })
})

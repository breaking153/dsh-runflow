import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope } from '@deepseek-ai/dsh-scope'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureRunFlowAgentAuthoring, installRunFlowAuthoring } from '../src/authoring-tools.ts'
import type { FlowService } from '../src/flow-service.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

async function liveSetup(presetId = 'builder', delayFlowPublication = false) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt, {})
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(SkillRegistry)
  const key = { preset: presetId }
  ctx.provide('agentPresets', { standingKeyFor: async () => key } as never)
  const agent = { id: 'creation-agent', session: { header: { agentPreset: presetId } } } as unknown as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    Object.defineProperty(agent, 'ctx', { value: createScope(inner, agent).ctx })
  }, { inject: ['tools', 'systemPrompt'] }))
  const live = [agent]
  ctx.provide('agents', { list: () => live } as never)
  const flow = {
    isAvailable: () => true,
    listNodeLibrary: vi.fn(() => []),
    listWorkflows: vi.fn(() => []),
    listExecutions: vi.fn(() => [{ id: 'owned' }, { id: 'foreign' }]),
    executionOwnedBy: (id: string, agentId: string) => id === 'owned' && agentId === 'creation-agent',
    execution: vi.fn(() => ({ id: 'owned' })),
    cancel: vi.fn(() => true),
  } as unknown as FlowService
  if (!delayFlowPublication) ctx.provide('flow', flow)
  const fiber = await ctx.plugin(Object.assign(
    (inner: Context) => installRunFlowAuthoring(inner, flow, presetId),
    { inject: ['agents', 'agentPresets', 'skills', 'systemPrompt', 'tools'] },
  ))
  await vi.waitFor(() => { expect(ctx.tools.get('runflow_node', agent)).toBeDefined() })
  if (delayFlowPublication) ctx.provide('flow', flow)
  return { ctx, key, agent, live, flow, fiber }
}

describe('RunFlow creation-mode authoring layer', () => {
  it('exposes tools and skill only to the configured creation preset scope', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt, {})
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(SkillRegistry)

    const creationKey = { preset: 'cordis' }
    const otherKey = { preset: 'code' }
    ctx.provide('agentPresets', {
      standingKeyFor(id?: string) {
        expect(id).toBe('cordis')
        return Promise.resolve(creationKey)
      },
    } as never)

    await ctx.plugin(Object.assign(
      (inner: Context) => installRunFlowAuthoring(inner, {} as FlowService, 'cordis'),
      { inject: ['agentPresets', 'skills', 'systemPrompt', 'tools'] },
    ))

    await vi.waitFor(() => {
      expect(ctx.tools.get('runflow_node', creationKey)).toBeDefined()
      expect(ctx.tools.get('runflow_workflow', creationKey)).toBeDefined()
    })

    expect(ctx.tools.get('runflow_node')).toBeUndefined()
    expect(ctx.tools.get('runflow_node', otherKey)).toBeUndefined()
    expect(ctx.tools.schemas(creationKey).map(tool => tool.name)).toEqual(expect.arrayContaining([
      'run_code',
      'runflow_node',
      'runflow_workflow',
    ]))
    expect(ctx.tools.schemas(otherKey).map(tool => tool.name)).not.toContain('runflow_node')

    expect((await ctx.skills.list()).map(skill => skill.name)).not.toContain('dsh-runflow-node-development')
    expect((await ctx.skills.list({ scope: creationKey })).map(skill => skill.name)).toContain(
      'dsh-runflow-node-development',
    )
    expect((await ctx.skills.list({ scope: otherKey })).map(skill => skill.name)).not.toContain(
      'dsh-runflow-node-development',
    )

  })

  it('removes fallback Agent tools, presentation, and skills with the authoring plugin', async () => {
    const { ctx, agent, fiber } = await liveSetup()
    expect(ctx.tools.get('runflow_workflow', agent)).toBeDefined()
    await fiber.dispose()
    expect(ctx.tools.get('runflow_node', agent)).toBeUndefined()
    expect(ctx.tools.get('runflow_workflow', agent)).toBeUndefined()
    expect(ctx.tools.get('run_code', agent)).toBeUndefined()
    expect((await ctx.skills.list({ scope: agent })).map(skill => skill.name)).not.toContain('dsh-runflow-node-development')
  })

  it('uses the configured preset for live fallback and exposes its authoring skill', async () => {
    const { ctx, agent, flow } = await liveSetup('custom-creation')
    expect(ensureRunFlowAgentAuthoring(ctx, flow, agent)).toBe(true)
    expect((await ctx.skills.list({ scope: agent })).map(skill => skill.name)).toContain('dsh-runflow-node-development')
    const wrong = { ...agent, session: { header: { agentPreset: 'cordis' } } } as unknown as Agent
    expect(ensureRunFlowAgentAuthoring(ctx, flow, wrong)).toBe(false)
    expect(ctx.tools.get('runflow_node', wrong)).toBeUndefined()
  })

  it('rejects a retained authoring callback after its plugin unloads', async () => {
    const { ctx, agent, fiber, flow } = await liveSetup()
    const retained = ctx.tools.get('runflow_node', agent)!
    await fiber.dispose()
    await expect(retained.execute({ action: 'list' }, {
      agent, signal: new AbortController().signal,
    } as ToolRunContext)).rejects.toThrow(/unavailable/iu)
    expect(flow.listNodeLibrary).not.toHaveBeenCalled()
  })

  it('removes a disposed Agent contribution and does not reattach it', async () => {
    const { ctx, agent, live, flow } = await liveSetup()
    live.splice(0)
    ctx.emit('agent/disposed', { agent })
    await vi.waitFor(() => { expect(ctx.tools.get('runflow_node', agent)).toBeUndefined() })
    expect(ensureRunFlowAgentAuthoring(ctx, flow, agent)).toBe(false)
  })

  it('limits creation-tool execution inspection and cancellation to the caller owner', async () => {
    const { ctx, agent, flow } = await liveSetup()
    const tool = ctx.tools.get('runflow_workflow', agent)!
    const exec = { agent, signal: new AbortController().signal } as ToolRunContext
    expect(await tool.execute({ action: 'list_executions' }, exec)).toEqual({ executions: [{ id: 'owned' }] })
    await expect(tool.execute({ action: 'get_execution', executionId: 'foreign' }, exec)).rejects.toThrow(/owned/iu)
    await expect(tool.execute({ action: 'cancel', executionId: 'foreign' }, exec)).rejects.toThrow(/owned/iu)
    expect(flow.cancel).not.toHaveBeenCalled()
  })

  it('reloads cleanly and attaches a newly created Agent under plugin ownership', async () => {
    const { ctx, fiber, flow, live, agent } = await liveSetup()
    await fiber.dispose()
    expect(ensureRunFlowAgentAuthoring(ctx, flow, agent)).toBe(false)
    const second = await ctx.plugin(Object.assign((inner: Context) => installRunFlowAuthoring(inner, flow, 'builder'), {
      inject: ['flow', 'agents', 'agentPresets', 'skills', 'systemPrompt', 'tools'],
    }))
    await vi.waitFor(() => { expect(ctx.tools.get('runflow_node', agent)).toBeDefined() })
    const later = { id: 'later', session: { header: { agentPreset: 'builder' } } } as unknown as Agent
    live.push(later)
    ctx.emit('agent/created', { agent: later })
    expect(ctx.tools.get('runflow_node', later)).toBeDefined()
    expect(ctx.tools.schemas(agent).filter(tool => tool.name === 'runflow_node')).toHaveLength(1)
    await second.dispose()
    expect(ctx.tools.get('runflow_node', later)).toBeUndefined()
    expect(ctx.tools.get('runflow_node', agent)).toBeUndefined()
  })

  it('attaches existing creation Agents while the Host flow provider is still activating', async () => {
    const { ctx, agent } = await liveSetup('builder', true)
    expect(await ctx.tools.get('runflow_node', agent)!.execute({ action: 'list' }, {
      agent, signal: new AbortController().signal,
    } as ToolRunContext)).toEqual({ nodes: [] })
  })
})

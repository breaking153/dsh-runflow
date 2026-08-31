import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { installRunFlowAuthoring } from '../src/authoring-tools.ts'
import type { FlowService } from '../src/flow-service.ts'

describe('RunFlow creation-mode authoring layer', () => {
  it('exposes tools and skill only to the configured creation preset scope', async () => {
    const ctx = new Context()
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
})
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import CodeRuntime from '@deepseek-ai/dsh-code-runtime'
import type { CodeRunRequest, CodeRunResult } from '@deepseek-ai/dsh-code-runtime'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import type { ResolvedSubagentStartRequest, SubagentProvider } from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { describe, expect, it } from 'vitest'
import * as flowPlugin from '../src/index.ts'

class FixtureCodeRuntime extends CodeRuntime {
  readonly language = 'typescript'
  readonly isolation = 'fixture'
  lastRequest?: CodeRunRequest

  run(request: CodeRunRequest): Promise<CodeRunResult> {
    this.lastRequest = request
    return Promise.resolve({ value: { answer: 42 }, logs: ['runtime log'] })
  }
}

function fixtureAgent(ctx: Context): Agent {
  return {
    id: 'agent-1' as Agent['id'],
    options: {},
    ctx,
    status: 'idle',
    session: { id: 'agent-1', append() {}, events: [] } as unknown as Agent['session'],
    inbox: {} as Agent['inbox'],
    cancel() {},
    whenIdle: () => Promise.resolve(),
    runMaintenance: task => task(new AbortController().signal),
    send() {},
    followup() {},
    steer() {},
    inject() {},
  }
}

describe('dsh-runflow Cordis composition', () => {
  it('loads the script directory as a child Cordis plugin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-composition-'))
    const ctx = new Context()
    new AgentRegistry(ctx)
    new LlmRuntime(ctx)
    new SubagentRuntime(ctx)
    new SystemPrompt(ctx, {})
    const runtime = new FixtureCodeRuntime(ctx)
    new ToolRuntime(ctx, { mode: 'code' })
    new TypertRegistry(ctx)
    await ctx.plugin(flowPlugin, {
      outputDir: join(root, 'output'),
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
    })

    expect(ctx.flow.listNodes()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'dsh.agent', available: true }),
      expect.objectContaining({ type: 'script.javascript', available: true }),
    ]))
    expect(ctx.flowScript.channel.list()).toEqual([])

    ctx.agents.register(fixtureAgent(ctx))
    const result = await ctx.flowScript.run({
      requestId: 'script-request',
      executionId: 'execution-1',
      nodeId: 'script-1',
      agentId: 'agent-1',
      description: 'composition test',
      program: 'return { answer: input.seed }',
      input: { seed: 42 },
      signal: new AbortController().signal,
    })
    expect(result).toEqual(expect.objectContaining({
      status: 'success',
      value: { answer: 42 },
      logs: ['runtime log'],
      runtime: expect.objectContaining({ transport: 'run_code', language: 'typescript' }),
    }))
    expect(runtime.lastRequest?.program).toContain('const __runflow = JSON.parse')
    expect(runtime.lastRequest?.program).toContain('const inputs = __runflow.inputs')

    let captured: ResolvedSubagentStartRequest | undefined
    let disposed = false
    const subagentProvider: SubagentProvider = {
      name: 'fixture-spawn',
      inheritsParentContext: false,
      capabilities: { outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
      start(request) {
        captured = request
        return Promise.resolve({
          id: 'child-1' as Agent['id'],
          localAgent: undefined,
          result: Promise.resolve({
            output: [{ type: 'text', text: 'review complete' }],
            structured: { verdict: 'approve' },
            stopReason: 'completed',
          }),
          dispose() { disposed = true; return Promise.resolve() },
        })
      },
    }
    ctx.subagents.registerProvider(subagentProvider)
    ctx.flow.saveWorkflow({
      id: 'agent-flow',
      name: 'Agent Flow',
      version: 1,
      nodes: [{
        id: 'reviewer',
        type: 'dsh.agent',
        config: {
          subagentProvider: 'fixture-spawn',
          provider: 'route-a',
          model: 'model-a',
          maxTokens: 2048,
          maxDepth: 2,
          persona: 'Review precisely.',
          prompt: 'Review {{input}}',
        },
      }],
      edges: [],
    })
    const agentExecution = await ctx.flow.execute('agent-flow', {
      agentId: 'agent-1',
      input: { change: 7 },
    })
    expect(agentExecution.status).toBe('SUCCESS')
    expect(agentExecution.output).toEqual(expect.objectContaining({
      subagentProvider: 'fixture-spawn',
      modelProvider: 'route-a',
      model: 'model-a',
      text: 'review complete',
      structured: { verdict: 'approve' },
    }))
    expect(captured?.agentOptions).toEqual({ provider: 'route-a', model: 'model-a', maxTokens: 2048 })
    expect(captured?.maxDepth).toBe(2)
    expect(captured?.persona).toBe('Review precisely.')
    expect(disposed).toBe(true)
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
})

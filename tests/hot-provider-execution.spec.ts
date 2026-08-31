import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as flowPlugin from '../src/index.ts'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

function source(type: string, version: string): string {
  return `export default {
    name: 'fixture-${type}',
    inject: ['flow'],
    apply(ctx) {
      ctx.flow.registerNode({
        type: '${type}', title: '${type}', description: '${version}', category: 'action',
        color: '#2563eb', icon: 'braces', inputs: [], outputs: [{ id: 'output', type: 'json' }],
        async execute(execution) {
          execution.log('ctx.flow provider ${version}')
          await execution.writeIntermediate('provider-version', { version: '${version}' }, 'output')
          return { version: '${version}', nodeType: execution.node.type }
        },
      })
    },
  }\n`
}

describe('file-backed providers execute their latest loaded behavior', () => {
  it('hot-switches both .node and .script Cordis plugins', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runflow-hot-providers-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const scriptsDir = join(root, 'script')
    const ctx = new Context()
    new AgentRegistry(ctx)
    new LlmRuntime(ctx)
    new SubagentRuntime(ctx)
    new SystemPrompt(ctx, {})
    new ToolRuntime(ctx, { mode: 'native' })
    new TypertRegistry(ctx)
    await ctx.plugin(flowPlugin, {
      nodesDir,
      scriptsDir,
      outputDir: join(root, 'output'),
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: true,
      enableAuthoringTools: false,
    })

    const nodePath = join(nodesDir, 'live.node.mjs')
    const scriptPath = join(scriptsDir, 'live.script.mjs')
    await writeFile(nodePath, source('fixture.hot-node', 'node-v1'))
    await writeFile(scriptPath, source('fixture.hot-script', 'script-v1'))
    await vi.waitFor(() => {
      expect(ctx.flow.node('fixture.hot-node')?.descriptor.description).toBe('node-v1')
      expect(ctx.flow.node('fixture.hot-script')?.descriptor.description).toBe('script-v1')
    }, { timeout: 5000 })

    const execute = async (type: string) => {
      const id = 'hot-' + type
      if (ctx.flow.workflow(id) === undefined) ctx.flow.saveWorkflow({
        id, name: type, version: 1,
        nodes: [{ id: 'provider', type, config: {} }], edges: [],
      })
      return await ctx.flow.execute(id, { input: { source: 'test' } })
    }
    expect((await execute('fixture.hot-node')).output).toEqual({ version: 'node-v1', nodeType: 'fixture.hot-node' })
    expect((await execute('fixture.hot-script')).output).toEqual({ version: 'script-v1', nodeType: 'fixture.hot-script' })

    await writeFile(nodePath, source('fixture.hot-node', 'node-v2'))
    await writeFile(scriptPath, source('fixture.hot-script', 'script-v2'))
    await vi.waitFor(() => {
      expect(ctx.flow.node('fixture.hot-node')?.descriptor.description).toBe('node-v2')
      expect(ctx.flow.node('fixture.hot-script')?.descriptor.description).toBe('script-v2')
    }, { timeout: 5000 })

    const nodeV2 = await execute('fixture.hot-node')
    const scriptV2 = await execute('fixture.hot-script')
    expect(nodeV2.output).toEqual({ version: 'node-v2', nodeType: 'fixture.hot-node' })
    expect(scriptV2.output).toEqual({ version: 'script-v2', nodeType: 'fixture.hot-script' })
    expect(nodeV2.nodes[0]?.artifacts?.some(artifact => artifact.kind === 'intermediate')).toBe(true)
    await ctx.fiber.dispose()
  })
})

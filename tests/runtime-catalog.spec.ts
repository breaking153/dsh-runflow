import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SubagentRuntime } from '@deepseek-ai/dsh-subagent'
import type { SubagentProvider } from '@deepseek-ai/dsh-subagent'
import { describe, expect, it } from 'vitest'
import { FlowService } from '../src/flow-service.ts'

class CatalogAdapter extends LlmAdapter {
  override listModels(provider: string) {
    return Promise.resolve([{ provider, id: 'model-a', name: 'Model A', inputModalities: ['text' as const] }])
  }

  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {}
}

const provider: SubagentProvider = {
  name: 'spawn',
  inheritsParentContext: false,
  capabilities: { outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
  start() { return Promise.reject(new Error('not used by catalog test')) },
}

describe('Harness runtime catalog', () => {
  it('projects live subagent providers and LLM model routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-catalog-'))
    const ctx = new Context()
    new LlmRuntime(ctx)
    new SubagentRuntime(ctx)
    ctx.llm.registerAdapter(['route-a'], new CatalogAdapter())
    ctx.subagents.registerProvider(provider)
    const flow = new FlowService(ctx, {
      nodesDir: join(root, 'nodes'),
      scriptsDir: join(root, 'script'),
      outputDir: join(root, 'output'),
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })

    await expect(flow.runtimeCatalog()).resolves.toEqual(expect.objectContaining({
      subagentProviders: [expect.objectContaining({ id: 'spawn', capabilities: expect.objectContaining({ persona: true }) })],
      modelProviders: [expect.objectContaining({
        id: 'route-a',
        models: [expect.objectContaining({ id: 'model-a', name: 'Model A' })],
      })],
    }))
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
})

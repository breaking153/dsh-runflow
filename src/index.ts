/** Visual DAG workflow orchestration for DeepSeek Harness. */

import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type { FlowConfig } from './contracts.ts'
import { installRunFlowAuthoring } from './authoring-tools.ts'
import { FlowService } from './flow-service.ts'
import { RunFlowRemoteService } from './remote-service.ts'
import { RUNFLOW_HOST } from './remote-contract.ts'
import { migrateLegacyRunFlowRuntime, resolveRunFlowRuntimePaths } from './runtime-paths.ts'
import scriptPlugin from '../script/index.ts'
import nodeExecutorPlugin from '../nodes/index.ts'

export * from './contracts.ts'
export { executeWorkflow, validateWorkflow, WorkflowExecutionError, WorkflowValidationError } from './engine.ts'
export { FlowService } from './flow-service.ts'
export { RunFlowRemoteService } from './remote-service.ts'
export type { RunFlowStartReceipt, RunFlowStartRequest, RunFlowWorkspaceSnapshot } from './remote-contract.ts'
export * from './node-library.ts'
export * from './output-store.ts'
export * from './plugin-sdk.ts'
export * from './plugin-sources.ts'
export * from './runtime-paths.ts'
export * from '../script/index.ts'
export * from '../nodes/index.ts'

export const name = 'dsh-runflow'
export const inject = ['agents', 'subagents', 'llm', 'tools', 'typert']
export type Config = FlowConfig
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const Config: z<Config> = z.object({
  maxParallelNodes: z.number().step(1).min(1).max(64).default(4),
  defaultTimeoutMs: z.number().step(1).min(100).max(3_600_000).default(30_000),
  outputDir: z.string(),
  nodesDir: z.string(),
  scriptsDir: z.string(),
  workflowsDir: z.string(),
  storageDir: z.string(),
  watchFiles: z.boolean().default(true),
  enableAuthoringTools: z.boolean().default(true),
  authoringPresetId: z.string().default('cordis'),
})

/** Install the Host workflow service, Cordis executors, file watchers, and creation authoring layer. */
export async function apply(ctx: Context, config: Config = {}): Promise<void> {
  const nodesDir = resolve(config.nodesDir ?? join(pluginRoot, 'nodes'))
  const scriptsDir = resolve(config.scriptsDir ?? join(pluginRoot, 'script'))
  const runtimePaths = resolveRunFlowRuntimePaths(config)
  if (config.storageDir === undefined && config.workflowsDir === undefined) {
    const migration = migrateLegacyRunFlowRuntime({ cwd: process.cwd(), pluginRoot })
    if (migration.importedWorkspace !== undefined || migration.importedWorkflows.length > 0) {
      ctx.logger.info(
        'RunFlow imported legacy state into %s (%d workflow files)',
        migration.paths.dataDir,
        migration.importedWorkflows.length,
      )
    }
  }
  const flow = new FlowService(ctx, {
    ...config,
    nodesDir,
    scriptsDir,
    outputDir: runtimePaths.outputDir,
    storageDir: runtimePaths.dataDir,
    workflowsDir: runtimePaths.workflowsDir,
  })
  new RunFlowRemoteService(ctx)
  ctx.typert.register(RUNFLOW_HOST)
  await ctx.plugin(scriptPlugin, { scriptsDir, watchFiles: config.watchFiles ?? true })
  await ctx.plugin(nodeExecutorPlugin, { nodesDir, watchFiles: config.watchFiles ?? true })
  if (config.enableAuthoringTools ?? true) {
    ctx.inject(['agentPresets', 'skills', 'systemPrompt'], authoringCtx => {
      installRunFlowAuthoring(authoringCtx, flow, config.authoringPresetId ?? 'cordis')
    })
  }
}

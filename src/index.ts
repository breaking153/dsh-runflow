/** Visual DAG workflow orchestration for DeepSeek Harness. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { FlowConfig } from './contracts.ts'
import { FlowService } from './flow-service.ts'
import scriptPlugin from '../script/index.ts'

export * from './contracts.ts'
export { executeWorkflow, validateWorkflow, WorkflowExecutionError, WorkflowValidationError } from './engine.ts'
export { FlowService } from './flow-service.ts'
export * from '../script/index.ts'

export const name = 'dsh-flow'
export const inject = ['agents', 'subagents', 'llm', 'tools']
export type Config = FlowConfig

export const Config: z<Config> = z.object({
  maxParallelNodes: z.number().step(1).min(1).max(64).default(4),
  defaultTimeoutMs: z.number().step(1).min(100).max(3_600_000).default(30_000),
})

/** Install the Host workflow service and its separately-scoped script Cordis plugin. */
export function apply(ctx: Context, config: Config = {}): void {
  new FlowService(ctx, config)
  ctx.plugin(scriptPlugin)
}

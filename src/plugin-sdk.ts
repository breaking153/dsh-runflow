import type { Context, Plugin } from '@deepseek-ai/cordis'
import type {
  JsonValue,
  NodeExecutionContext,
  NodeOutputEnvelope,
  WorkflowNodeDescriptor,
} from './contracts.ts'
import type { FlowService } from './flow-service.ts'

export type RunFlowHostPluginContext = Context

export interface RunFlowHostNodePluginDefinition {
  /** Optional Cordis diagnostic name. */
  name?: string
  /** Additional Host services required before this child plugin activates. */
  inject?: string[]
  node: WorkflowNodeDescriptor
  execute(
    ctx: RunFlowHostPluginContext,
    execution: NodeExecutionContext,
  ): JsonValue | NodeOutputEnvelope | Promise<JsonValue | NodeOutputEnvelope>
}

/**
 * Define a trusted file-backed Node Cordis plugin with complete ctx and
 * execution-context inference in TypeScript/WebStorm.
 */
export function defineRunFlowNodePlugin(definition: RunFlowHostNodePluginDefinition): Plugin.Object<void> {
  const plugin: Plugin.Object<void> = {
    name: definition.name ?? 'runflow-node:' + definition.node.type,
    inject: [...new Set(['flow', ...(definition.inject ?? [])])],
    apply(ctx) {
      const flow = (ctx as Context & { flow: FlowService }).flow
      return flow.registerNode({
        ...structuredClone(definition.node),
        execute: execution => Promise.resolve(definition.execute(ctx, execution)),
      })
    },
  }
  return plugin
}

/**
 * Script-directory variant. It is also a Cordis plugin and may use ctx
 * directly; use script.javascript when isolation through DSH run_code is
 * preferred over trusted Host access.
 */
export function defineRunFlowScriptPlugin(definition: RunFlowHostNodePluginDefinition): Plugin.Object<void> {
  return defineRunFlowNodePlugin({
    ...definition,
    name: definition.name ?? 'runflow-script:' + definition.node.type,
  })
}

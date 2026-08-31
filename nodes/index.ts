/** Cordis Node executor and hot-loader for local RunFlow providers. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { JsonValue, NodeExecutionContext, WorkflowNodeDescriptor } from '../src/contracts.ts'
import { DirectoryPluginLoader } from '../src/directory-plugin-loader.ts'
import type { FlowService } from '../src/flow-service.ts'

export interface FlowNodeExecutorConfig {
  nodesDir: string
  watchFiles?: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    flow: FlowService
    flowNodeExecutor: FlowNodeExecutorService
  }
}

export class FlowNodeExecutorService extends Service {
  private readonly loader: DirectoryPluginLoader

  constructor(ctx: Context, config: FlowNodeExecutorConfig) {
    super(ctx, 'flowNodeExecutor')
    this.loader = new DirectoryPluginLoader(ctx, {
      directory: config.nodesDir,
      suffixes: ['.node.ts', '.node.mts', '.node.js', '.node.mjs'],
      label: 'RunFlow Node plugin',
      watch: config.watchFiles ?? true,
    })
    ctx.effect(async () => {
      const stopDocuments = ctx.flow.nodeLibrary.startWatching()
      await this.loader.start()
      return async () => {
        stopDocuments()
        await this.loader.dispose()
      }
    }, 'dsh-runflow: Node executor directories')
  }

  async runProgram(
    context: NodeExecutionContext,
    program: string,
    descriptor: WorkflowNodeDescriptor,
  ): Promise<JsonValue> {
    const scripts = this.ctx.get('flowScript') as {
      runProgram(context: NodeExecutionContext, program: string, description?: string): Promise<JsonValue>
    } | undefined
    if (scripts === undefined) throw new Error('dsh-runflow Script executor is unavailable')
    return await scripts.runProgram(
      context,
      program,
      'Execute custom RunFlow node ' + descriptor.type + ' (' + context.node.id + ')',
    )
  }
}

export const name = 'dsh-runflow-node-executor'
export const inject = ['flow']

export function apply(ctx: Context, config: FlowNodeExecutorConfig): void {
  new FlowNodeExecutorService(ctx, config)
}

const plugin = { name, inject, apply }
export default plugin

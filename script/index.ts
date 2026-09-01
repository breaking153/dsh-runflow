/** Cordis plugin that executes Flow JavaScript nodes through DSH run_code. */

import { Context, Service } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { JsonValue, NodeExecutionContext } from '../src/contracts.ts'
import type { FlowService } from '../src/flow-service.ts'
import { DirectoryPluginLoader } from '../src/directory-plugin-loader.ts'
import { FlowScriptChannel, type FlowScriptChannelTicket } from './channel.ts'
import type {
  FlowScriptError,
  FlowScriptExecutionResult,
  FlowScriptRequest,
} from './contracts.ts'

export * from './channel.ts'
export * from './contracts.ts'

export const name = 'dsh-runflow-script'
export const inject = ['flow', 'tools', 'agents']

export interface FlowScriptConfig {
  scriptsDir: string
  watchFiles?: boolean
}

const json = (value: unknown): JsonValue => {
  const encoded = JSON.stringify(value)
  if (encoded === undefined) return null
  return JSON.parse(encoded) as JsonValue
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

function requireString(value: JsonValue | undefined, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('JavaScript node requires non-empty config.' + name)
  }
  return value
}

function codeProgram(source: string, request: FlowScriptRequest): string {
  const runtime = JSON.stringify({
    input: request.input,
    inputs: request.inputs ?? {},
    config: request.config ?? {},
    executionId: request.executionId,
    nodeId: request.nodeId,
    outputDir: request.outputDir ?? null,
    intermediateDir: request.intermediateDir ?? null,
  })
  const literal = JSON.stringify(runtime)
  return [
    'const __runflow = JSON.parse(' + literal + ');',
    'const input = __runflow.input;',
    'const inputs = __runflow.inputs;',
    'const config = __runflow.config;',
    'const runflow = Object.freeze(__runflow);',
    source,
  ].join('\n')
}

function errorInfo(result: ToolExecutionResult): FlowScriptError | undefined {
  if (!result.isError) return undefined
  return {
    code: result.error.info?.code ?? 'FLOW_RUN_CODE_FAILED',
    name: result.error.info?.name ?? 'RunCodeError',
    message: result.error.message,
  }
}

function runCodePayload(result: ToolExecutionResult): { logs: string[]; value?: JsonValue } {
  if (result.isError || typeof result.value !== 'object' || result.value === null || Array.isArray(result.value)) {
    return { logs: [] }
  }
  const logs = Array.isArray(result.value['logs'])
    ? result.value['logs'].filter((item): item is string => typeof item === 'string')
    : []
  const value = result.value['result']
  return value === undefined ? { logs } : { logs, value: json(value) }
}

export class FlowScriptExecutionError extends Error {
  constructor(readonly result: FlowScriptExecutionResult) {
    super(result.error?.message ?? 'run_code ended with ' + result.status)
    this.name = 'FlowScriptExecutionError'
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    flow: FlowService
    flowScript: FlowScriptService
  }
}

/**
 * Agent-scoped run_code adapter with a separately awaitable correlation channel.
 * The service never evals source and never temporarily changes an Agent's tool mode.
 */
export class FlowScriptService extends Service {
  readonly channel = new FlowScriptChannel()
  private readonly loader: DirectoryPluginLoader

  constructor(ctx: Context, config: FlowScriptConfig) {
    super(ctx, 'flowScript')
    this.loader = new DirectoryPluginLoader(ctx, {
      directory: config.scriptsDir,
      suffixes: ['.script.ts', '.script.mts', '.script.js', '.script.mjs'],
      label: 'RunFlow Script plugin',
      watch: config.watchFiles ?? true,
    })
    ctx.effect(async () => {
      await this.loader.start()
      return () => this.loader.dispose()
    }, 'dsh-runflow: Script executor directory')
    ctx.flow.registerNode({
      type: 'script.javascript',
      title: 'JavaScript',
      description: 'Execute JavaScript through the Harness run_code transport.',
      category: 'action',
      color: '#facc15',
      icon: 'square-code',
      available: true,
      inputs: [{ id: 'input', label: 'input', type: 'any' }],
      outputs: [{ id: 'output', label: 'output', type: 'any' }],
      configSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          description: { type: 'string' },
        },
      },
      execute: context => this.executeNode(context),
    })
  }

  submit(request: FlowScriptRequest): FlowScriptChannelTicket {
    const ticket = this.channel.enqueue(request)
    void this.dispatch(ticket.requestId, request)
    return ticket
  }

  run(request: FlowScriptRequest): Promise<FlowScriptExecutionResult> {
    return this.submit(request).result
  }

  wait(requestId: string, signal?: AbortSignal): Promise<FlowScriptExecutionResult> {
    return this.channel.wait(requestId, signal)
  }

  async runProgram(
    context: NodeExecutionContext,
    program: string,
    description?: string,
  ): Promise<JsonValue> {
    if (context.agentId === undefined) {
      throw new Error('JavaScript nodes require ExecuteWorkflowOptions.agentId for Agent-scoped run_code')
    }
    const result = await this.run({
      executionId: context.executionId,
      nodeId: context.node.id,
      agentId: context.agentId,
      description: description ?? 'Execute dsh-runflow JavaScript node ' + context.node.id,
      program,
      input: context.input,
      inputs: { ...context.inputs },
      config: context.node.config,
      ...(context.outputDir === undefined ? {} : { outputDir: context.outputDir }),
      ...(context.intermediateDir === undefined ? {} : { intermediateDir: context.intermediateDir }),
      signal: context.signal,
    })
    for (const line of result.logs) context.log(line, undefined, 'debug')
    await context.writeIntermediate('run-code-result', json(result))
    if (result.status !== 'success') throw new FlowScriptExecutionError(result)
    return result.value ?? null
  }

  private async executeNode(context: NodeExecutionContext): Promise<JsonValue> {
    const program = requireString(context.node.config['code'], 'code')
    const configuredDescription = context.node.config['description']
    return await this.runProgram(
      context,
      program,
      typeof configuredDescription === 'string' && configuredDescription.trim().length > 0
        ? configuredDescription.trim()
        : undefined,
    )
  }

  private async dispatch(requestId: string, request: FlowScriptRequest): Promise<void> {
    const running = this.channel.running(requestId)
    const startedAt = running.startedAt ?? running.queuedAt
    let result: FlowScriptExecutionResult
    try {
      const agent = this.ctx.agents.list().find(candidate => String(candidate.id) === request.agentId)
      if (agent === undefined) throw new Error('live parent Agent not found: ' + request.agentId)
      if (this.ctx.tools.get(RUN_CODE_NAME, agent) === undefined) {
        throw new Error(
          'Agent ' + request.agentId + ' does not expose run_code; use RunFlow from the DSH creation preset '
          + 'or select an Agent whose tool presentation mode includes code',
        )
      }
      const language = this.runtimeLanguage()
      if (language !== 'typescript') {
        throw new Error('JavaScript nodes require the DSH TypeScript code runtime; active runtime is ' + language)
      }
      const executed = await this.ctx.tools.execute({
        callId: ToolCallId('flow:' + request.executionId + ':' + request.nodeId + ':' + requestId),
        name: RUN_CODE_NAME,
        arguments: {
          code: codeProgram(request.program, request),
          description: request.description,
        },
        agent,
        signal: request.signal,
      })
      const finishedAt = new Date().toISOString()
      const payload = runCodePayload(executed)
      const error = errorInfo(executed)
      const cancelled = request.signal.aborted
        || (executed.isError && ['ABORTED', 'ABORTED_BEFORE_DISPATCH'].includes(executed.error.info?.code ?? ''))
      result = {
        requestId,
        executionId: request.executionId,
        nodeId: request.nodeId,
        status: cancelled ? 'cancelled' : executed.isError ? 'error' : 'success',
        ...(payload.value === undefined ? {} : { value: payload.value }),
        logs: payload.logs,
        ...(error === undefined ? {} : { error }),
        timing: {
          queuedAt: running.queuedAt,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
        },
        runtime: {
          transport: 'run_code',
          language: this.runtimeLanguage(),
          agentId: request.agentId,
        },
      }
    } catch (error) {
      const finishedAt = new Date().toISOString()
      const cancelled = request.signal.aborted
      result = {
        requestId,
        executionId: request.executionId,
        nodeId: request.nodeId,
        status: cancelled ? 'cancelled' : 'error',
        logs: [],
        error: {
          code: cancelled ? 'FLOW_SCRIPT_CANCELLED' : 'FLOW_RUN_CODE_DISPATCH_FAILED',
          name: error instanceof Error ? error.name : 'Error',
          message: messageOf(error),
        },
        timing: {
          queuedAt: running.queuedAt,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
        },
        runtime: {
          transport: 'run_code',
          language: this.runtimeLanguage(),
          agentId: request.agentId,
        },
      }
    }
    this.channel.settle(result)
  }

  private runtimeLanguage(): string {
    const runtime = this.ctx.get('codeRuntime') as { language?: unknown } | undefined
    return typeof runtime?.language === 'string' ? runtime.language : 'unknown'
  }
}

export function apply(ctx: Context, config: FlowScriptConfig): void {
  new FlowScriptService(ctx, config)
}

const plugin = { name, inject, apply }
export default plugin

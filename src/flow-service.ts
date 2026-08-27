import { Context, Service } from '@deepseek-ai/cordis'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import type {
  ExecuteWorkflowOptions,
  FlowConfig,
  FlowRuntimeCatalog,
  JsonObject,
  JsonValue,
  NodeExecutionContext,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNodeDefinition,
  WorkflowNodeDescriptor,
} from './contracts.ts'
import { executeWorkflow, validateWorkflow, WorkflowValidationError } from './engine.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    flow: FlowService
  }
}

const clone = <T>(value: T): T => structuredClone(value)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue
}

function objectConfig(value: JsonValue | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function readPath(value: JsonValue, path: string): JsonValue | undefined {
  let cursor: JsonValue | undefined = value
  for (const part of path.split('.').filter(Boolean)) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

function compare(left: JsonValue | undefined, operator: string, right: JsonValue | undefined): boolean {
  switch (operator) {
    case 'notEquals': return left !== right
    case 'contains': return typeof left === 'string' && typeof right === 'string' && left.includes(right)
    case 'greaterThan': return typeof left === 'number' && typeof right === 'number' && left > right
    case 'lessThan': return typeof left === 'number' && typeof right === 'number' && left < right
    default: return left === right
  }
}

function configString(config: JsonObject, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function configInteger(config: JsonObject, key: string): number | undefined {
  const value = config[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function agentPrompt(template: string | undefined, input: JsonValue): string {
  const renderedInput = JSON.stringify(input, null, 2)
  const base = template ?? 'Process the workflow input and return a concise result.'
  if (base.includes('{{input}}')) return base.replaceAll('{{input}}', renderedInput)
  return `${base}\n\n<workflow_input>\n${renderedInput}\n</workflow_input>`
}

function assistantText(result: SubagentResult): string {
  return result.output
    .filter((block): block is Extract<(typeof result.output)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

export class FlowService extends Service {
  private readonly nodes = new Map<string, WorkflowNodeDefinition>()
  private readonly workflows = new Map<string, WorkflowDefinition>()
  private readonly executions = new Map<string, WorkflowExecution>()
  private readonly executionOrder: string[] = []
  private readonly cancellations = new Map<string, AbortController>()
  private readonly maxParallelNodes: number
  private readonly defaultTimeoutMs: number

  constructor(ctx: Context, config: FlowConfig = {}) {
    super(ctx, 'flow')
    this.maxParallelNodes = config.maxParallelNodes ?? 4
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000
    this.installBuiltins()
  }

  registerNode(definition: WorkflowNodeDefinition): () => void {
    if (this.nodes.has(definition.type)) throw new Error(`flow: duplicate node provider ${definition.type}`)
    this.nodes.set(definition.type, definition)
    const dispose = (): void => { this.nodes.delete(definition.type) }
    this.ctx.effect(() => dispose, `flow.registerNode(${JSON.stringify(definition.type)})`)
    return dispose
  }

  listNodes(): WorkflowNodeDescriptor[] {
    return [...this.nodes.values()].map(({ execute: _execute, ...descriptor }) => clone(descriptor))
  }

  /** Read the Harness registries on every call; model catalogs are advisory and may change at runtime. */
  async runtimeCatalog(): Promise<FlowRuntimeCatalog> {
    const subagentProviders = this.ctx.subagents.list().map((id) => {
      const provider = this.ctx.subagents.getProvider(id)
      if (provider === undefined) throw new Error(`subagent provider disappeared while listing: ${id}`)
      return {
        id,
        inheritsParentContext: provider.inheritsParentContext,
        capabilities: { ...provider.capabilities },
      }
    })
    const modelProviders = await Promise.all(this.ctx.llm.listProviders().map(async provider => {
      try {
        const models = await this.ctx.llm.listModels(provider.id)
        return {
          id: provider.id,
          name: provider.name,
          models: models.map(model => ({
            id: model.id,
            name: model.name,
            ...(model.description === undefined ? {} : { description: model.description }),
            ...(model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] }),
          })),
        }
      } catch (error) {
        return { id: provider.id, name: provider.name, models: [], catalogError: errorMessage(error) }
      }
    }))
    return {
      revision: new Date().toISOString(),
      subagentProviders,
      modelProviders,
    }
  }

  listWorkflows(): WorkflowDefinition[] {
    return [...this.workflows.values()].map(clone)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  }

  workflow(id: string): WorkflowDefinition | undefined {
    const definition = this.workflows.get(id)
    return definition === undefined ? undefined : clone(definition)
  }

  saveWorkflow(input: WorkflowDefinition): WorkflowDefinition {
    const issues = validateWorkflow(input)
    if (issues.length > 0) throw new WorkflowValidationError(issues)
    const current = this.workflows.get(input.id)
    const now = new Date().toISOString()
    const saved: WorkflowDefinition = {
      ...clone(input),
      version: current === undefined ? Math.max(1, input.version) : current.version + 1,
      createdAt: current?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    }
    this.workflows.set(saved.id, saved)
    return clone(saved)
  }

  async execute(id: string, options: ExecuteWorkflowOptions = {}): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(id)
    if (workflow === undefined) throw new Error(`Workflow not found: ${id}`)
    const cancellation = new AbortController()
    const relay = (): void => cancellation.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', relay, { once: true })
    const execution = await executeWorkflow(workflow, { ...options, signal: cancellation.signal }, {
      maxParallelNodes: this.maxParallelNodes,
      defaultTimeoutMs: this.defaultTimeoutMs,
      resolveNode: type => this.nodes.get(type),
      onUpdate: snapshot => {
        if (!this.executions.has(snapshot.id)) this.executionOrder.unshift(snapshot.id)
        this.executions.set(snapshot.id, clone(snapshot))
        this.cancellations.set(snapshot.id, cancellation)
      },
    })
    options.signal?.removeEventListener('abort', relay)
    this.cancellations.delete(execution.id)
    return execution
  }

  cancel(executionId: string): boolean {
    const controller = this.cancellations.get(executionId)
    if (controller === undefined) return false
    controller.abort('Cancelled by user')
    return true
  }

  listExecutions(workflowId?: string, limit = 50): WorkflowExecution[] {
    return this.executionOrder
      .map(id => this.executions.get(id))
      .filter((value): value is WorkflowExecution => value !== undefined
        && (workflowId === undefined || value.workflowId === workflowId))
      .slice(0, Math.max(0, limit))
      .map(clone)
  }

  execution(id: string): WorkflowExecution | undefined {
    const value = this.executions.get(id)
    return value === undefined ? undefined : clone(value)
  }

  private install(definition: WorkflowNodeDefinition): void {
    this.nodes.set(definition.type, definition)
  }

  private async executeAgentNode(context: NodeExecutionContext): Promise<JsonValue> {
    if (context.agentId === undefined) {
      throw new Error('DSH Agent nodes require ExecuteWorkflowOptions.agentId as delegation authority')
    }
    const parent = this.ctx.agents.list().find(agent => String(agent.id) === context.agentId)
    if (parent === undefined) throw new Error(`live parent Agent not found: ${context.agentId}`)

    const availableProviders = this.ctx.subagents.list()
    const providerName = configString(context.node.config, 'subagentProvider') ?? availableProviders[0]
    if (providerName === undefined) throw new Error('no DSH subagent provider is registered')
    const provider = this.ctx.subagents.getProvider(providerName)
    if (provider === undefined) throw new Error(`unknown DSH subagent provider: ${providerName}`)

    const modelProvider = configString(context.node.config, 'provider')
    const model = configString(context.node.config, 'model')
    const maxTokens = configInteger(context.node.config, 'maxTokens')
    const agentOptions: AgentOptions = {
      ...(modelProvider === undefined ? {} : { provider: modelProvider }),
      ...(model === undefined ? {} : { model }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }
    const persona = configString(context.node.config, 'persona')
    const maxDepth = configInteger(context.node.config, 'maxDepth')
    const run = await this.ctx.subagents.start(providerName, {
      label: context.node.name ?? context.node.id,
      prompt: [{ type: 'text', text: agentPrompt(configString(context.node.config, 'prompt'), context.input) }],
      parent,
      signal: context.signal,
      ...(Object.keys(agentOptions).length === 0 ? {} : { agentOptions }),
      ...(persona === undefined ? {} : { persona }),
      ...(maxDepth === undefined ? {} : { maxDepth }),
    })

    let result: SubagentResult
    try {
      result = await run.result
    } finally {
      await run.dispose()
    }
    if (result.stopReason !== 'completed') {
      throw new Error(result.diagnostic ?? `subagent ${run.id} ended with ${result.stopReason}`)
    }
    return json({
      runId: String(run.id),
      sessionId: String(run.localAgent?.id ?? run.id),
      subagentProvider: providerName,
      inheritsParentContext: provider.inheritsParentContext,
      modelProvider: agentOptions.provider ?? parent.options.provider ?? null,
      model: agentOptions.model ?? parent.options.model ?? null,
      stopReason: result.stopReason,
      text: assistantText(result),
      content: result.output,
      ...(result.structured === undefined ? {} : { structured: result.structured }),
    })
  }

  private installBuiltins(): void {
    const passThrough = async ({ input }: { input: JsonValue }): Promise<JsonValue> => input
    this.install({ type: 'trigger.manual', title: 'Manual Trigger', description: 'Run the workflow on demand.', category: 'trigger', color: '#22c55e', icon: 'mouse-pointer-click', execute: passThrough })
    this.install({ type: 'trigger.webhook', title: 'Webhook', description: 'Start from an inbound HTTP request.', category: 'trigger', color: '#22c55e', icon: 'webhook', execute: passThrough })
    this.install({ type: 'trigger.schedule', title: 'Schedule', description: 'Start from a Cron schedule.', category: 'trigger', color: '#22c55e', icon: 'clock-3', execute: passThrough })
    this.install({ type: 'trigger.dsh-event', title: 'DSH Event', description: 'Listen for a Cordis or DSH event.', category: 'trigger', color: '#22c55e', icon: 'radio', execute: passThrough })
    this.install({
      type: 'builtin.condition', title: 'Condition', description: 'Route data using a boolean comparison.', category: 'logic', color: '#a78bfa', icon: 'git-branch',
      async execute({ input, node }) {
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const operator = typeof node.config['operator'] === 'string' ? node.config['operator'] : 'equals'
        return { matched: compare(readPath(input, path), operator, node.config['value']), value: input }
      },
    })
    this.install({
      type: 'builtin.set', title: 'Set Fields', description: 'Add or replace fields on an object.', category: 'data', color: '#38bdf8', icon: 'list-plus',
      async execute({ input, node }) { return { ...objectConfig(input), ...objectConfig(node.config['values']) } },
    })
    this.install({
      type: 'http.request', title: 'HTTP Request', description: 'Call a remote HTTP endpoint.', category: 'action', color: '#fb923c', icon: 'globe-2',
      async execute({ node, signal }) {
        const url = node.config['url']
        if (typeof url !== 'string' || url.length === 0) throw new Error('HTTP Request requires config.url')
        const method = typeof node.config['method'] === 'string' ? node.config['method'] : 'GET'
        const response = await fetch(url, { method, signal })
        const text = await response.text()
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`)
        try { return JSON.parse(text) as JsonValue } catch { return { status: response.status, body: text } }
      },
    })
    this.install({
      type: 'dsh.agent',
      title: 'DSH Agent',
      description: 'Delegate to a native Harness Subagent with dynamic model routing.',
      category: 'ai',
      color: '#60a5fa',
      icon: 'bot',
      available: true,
      execute: context => this.executeAgentNode(context),
    })
    this.install({ type: 'storage.write', title: 'Storage', description: 'Persist the incoming result.', category: 'data', color: '#2dd4bf', icon: 'database', execute: passThrough })
  }
}
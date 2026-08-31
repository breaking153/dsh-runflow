import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, watch, writeFileSync,
  type FSWatcher,
} from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import type {
  ExecuteWorkflowOptions,
  FlowConfig,
  FlowRuntimeCatalog,
  JsonObject,
  JsonValue,
  NodeExecutionContext,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowNode,
  WorkflowNodeDefinition,
  WorkflowNodeDescriptor,
} from './contracts.ts'
import { executeWorkflow, validateWorkflow, WorkflowValidationError } from './engine.ts'
import {
  FlowNodeLibrary,
  type NodeDraftInput,
  type NodeLibraryEntry,
  type NodeTestReceipt,
} from './node-library.ts'
import { FileExecutionOutput } from './output-store.ts'
import {
  RunFlowPluginSourceLibrary,
  type RunFlowPluginSource,
  type SaveRunFlowPluginSourceRequest,
} from './plugin-sources.ts'
import { resolveRunFlowRuntimePaths } from './runtime-paths.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    flow: FlowService
  }
}

const clone = <T>(value: T): T => structuredClone(value)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue
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
  return base + '\n\n<workflow_input>\n' + renderedInput + '\n</workflow_input>'
}

function assistantText(result: SubagentResult): string {
  return result.output
    .filter((block): block is Extract<(typeof result.output)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

function workflowFileName(id: string): string {
  const readable = id.replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'workflow'
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 8)
  return readable + '-' + digest + '.workflow.json'
}

function workflowContent(definition: WorkflowDefinition): string {
  return JSON.stringify({
    id: definition.id,
    name: definition.name,
    nodes: definition.nodes,
    edges: definition.edges,
    outputDir: definition.outputDir ?? null,
    published: definition.published ?? false,
  })
}

export class FlowService extends Service {
  private readonly workflows = new Map<string, WorkflowDefinition>()
  private readonly executions = new Map<string, WorkflowExecution>()
  private readonly executionOrder: string[] = []
  private readonly cancellations = new Map<string, AbortController>()
  private readonly maxParallelNodes: number
  private readonly defaultTimeoutMs: number
  private readonly defaultOutputDir: string
  private readonly storageFile: string
  private readonly workflowsDir: string
  private readonly watchFiles: boolean
  private readonly workflowFileIds = new Map<string, string>()
  readonly nodeLibrary: FlowNodeLibrary
  readonly pluginSources: RunFlowPluginSourceLibrary

  constructor(ctx: Context, config: FlowConfig = {}) {
    super(ctx, 'flow')
    const runtimePaths = resolveRunFlowRuntimePaths(config)
    this.maxParallelNodes = config.maxParallelNodes ?? 4
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000
    this.defaultOutputDir = runtimePaths.outputDir
    this.storageFile = runtimePaths.workspaceFile
    this.workflowsDir = runtimePaths.workflowsDir
    this.watchFiles = config.watchFiles ?? true
    this.nodeLibrary = new FlowNodeLibrary(
      config.nodesDir ?? join(pluginRoot, 'nodes'),
      (program, descriptor, context) => this.executeProgramNode(program, descriptor, context),
      message => this.ctx.logger.warn(message),
    )
    this.pluginSources = new RunFlowPluginSourceLibrary(
      resolve(config.nodesDir ?? join(pluginRoot, 'nodes')),
      resolve(config.scriptsDir ?? join(pluginRoot, 'script')),
    )
    this.installBuiltins()
    this.loadWorkspace()
    if (this.watchFiles) this.ctx.effect(() => this.watchWorkflowDirectory(), 'dsh-runflow: workflow file watcher')
  }

  registerNode(definition: WorkflowNodeDefinition): () => void {
    const dispose = this.nodeLibrary.registerPlugin(definition)
    this.ctx.effect(() => dispose, 'flow.registerNode(' + JSON.stringify(definition.type) + ')')
    return dispose
  }

  listNodes(): WorkflowNodeDescriptor[] {
    return this.nodeLibrary.list().map(entry => clone(entry.descriptor))
  }

  listNodeLibrary(): NodeLibraryEntry[] {
    return clone(this.nodeLibrary.list())
  }

  listPluginSources(): RunFlowPluginSource[] {
    return clone(this.pluginSources.list())
  }

  savePluginSource(request: SaveRunFlowPluginSourceRequest): RunFlowPluginSource {
    return clone(this.pluginSources.save(request))
  }

  node(type: string): NodeLibraryEntry | undefined {
    return clone(this.nodeLibrary.get(type))
  }

  upsertNodeDraft(input: NodeDraftInput): NodeLibraryEntry {
    return clone(this.nodeLibrary.upsertDraft(input))
  }

  removeNodeDraft(type: string): boolean {
    return this.nodeLibrary.removeDraft(type)
  }

  async testNodeDraft(
    type: string,
    options: { agentId: string; input?: JsonValue; config?: JsonObject; outputDir?: string; signal?: AbortSignal },
  ): Promise<NodeTestReceipt> {
    const entry = this.nodeLibrary.get(type)
    if (entry?.source !== 'memory') throw new Error('only an in-memory node draft can be tested')
    const definition: WorkflowDefinition = {
      id: 'node-test-' + type,
      name: 'Node test: ' + entry.descriptor.title,
      version: 1,
      nodes: [{ id: 'node-under-test', type, config: clone(options.config ?? {}) }],
      edges: [],
    }
    const execution = await this.runDefinition(definition, {
      trigger: 'node-development',
      agentId: options.agentId,
      input: clone(options.input ?? {}),
      ...(options.outputDir === undefined ? {} : { outputDir: options.outputDir }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    return clone(this.nodeLibrary.markTested(type, execution))
  }

  async commitNodeDraft(type: string): Promise<NodeLibraryEntry> {
    return clone(await this.nodeLibrary.commit(type))
  }

  async removePersistedNode(type: string): Promise<boolean> {
    return await this.nodeLibrary.removePersisted(type)
  }

  /** Read the Harness registries on every call; model catalogs are advisory and may change at runtime. */
  async runtimeCatalog(): Promise<FlowRuntimeCatalog> {
    const subagentProviders = this.ctx.subagents.list().map((id) => {
      const provider = this.ctx.subagents.getProvider(id)
      if (provider === undefined) throw new Error('subagent provider disappeared while listing: ' + id)
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
    const issues = validateWorkflow(input, type => this.nodeLibrary.resolve(type))
    if (issues.length > 0) throw new WorkflowValidationError(issues)
    const current = this.workflows.get(input.id)
    const now = new Date().toISOString()
    const saved: WorkflowDefinition = {
      ...clone(input),
      version: current === undefined ? Math.max(1, input.version) : current.version + 1,
      createdAt: current?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
      published: current?.published ?? input.published ?? false,
      ...(current?.publishedVersion === undefined && input.publishedVersion === undefined ? {} : { publishedVersion: current?.publishedVersion ?? input.publishedVersion }),
      ...(current?.publishedAt === undefined && input.publishedAt === undefined ? {} : { publishedAt: current?.publishedAt ?? input.publishedAt }),
    }
    this.workflows.set(saved.id, saved)
    this.persistWorkflowFile(saved)
    this.persistWorkspace()
    return clone(saved)
  }

  /** Persist an incoming runnable definition only when its editable content changed. */
  ensureWorkflow(input: WorkflowDefinition): WorkflowDefinition {
    const current = this.workflows.get(input.id)
    if (current !== undefined && workflowContent(current) === workflowContent(input)) return clone(current)
    return this.saveWorkflow(input)
  }

  deleteWorkflow(id: string): boolean {
    const removed = this.workflows.delete(id)
    if (removed) {
      this.removeWorkflowFile(id)
      this.persistWorkspace()
    }
    return removed
  }

  setWorkflowPublished(id: string, published: boolean): WorkflowDefinition {
    const workflow = this.requireWorkflow(id)
    const now = new Date().toISOString()
    const next: WorkflowDefinition = { ...workflow, published, updatedAt: now }
    if (published) {
      next.publishedVersion = workflow.version
      next.publishedAt = now
    } else {
      delete next.publishedVersion
      delete next.publishedAt
    }
    this.workflows.set(id, next)
    this.persistWorkflowFile(next)
    this.persistWorkspace()
    return clone(next)
  }

  upsertWorkflowNode(workflowId: string, node: WorkflowNode): WorkflowDefinition {
    const workflow = this.requireWorkflow(workflowId)
    const index = workflow.nodes.findIndex(candidate => candidate.id === node.id)
    if (index === -1) workflow.nodes.push(clone(node))
    else workflow.nodes[index] = clone(node)
    return this.saveWorkflow(workflow)
  }

  updateWorkflowNode(
    workflowId: string,
    nodeId: string,
    patch: Partial<Omit<WorkflowNode, 'id'>>,
  ): WorkflowDefinition {
    const workflow = this.requireWorkflow(workflowId)
    const index = workflow.nodes.findIndex(candidate => candidate.id === nodeId)
    if (index === -1) throw new Error('workflow node not found: ' + nodeId)
    const current = workflow.nodes[index]!
    workflow.nodes[index] = {
      ...current,
      ...clone(patch),
      id: current.id,
      config: patch.config === undefined ? current.config : clone(patch.config),
    }
    return this.saveWorkflow(workflow)
  }

  removeWorkflowNode(workflowId: string, nodeId: string): WorkflowDefinition {
    const workflow = this.requireWorkflow(workflowId)
    if (!workflow.nodes.some(node => node.id === nodeId)) throw new Error('workflow node not found: ' + nodeId)
    workflow.nodes = workflow.nodes.filter(node => node.id !== nodeId)
    workflow.edges = workflow.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId)
    return this.saveWorkflow(workflow)
  }

  async execute(id: string, options: ExecuteWorkflowOptions = {}): Promise<WorkflowExecution> {
    return await this.runDefinition(this.requireWorkflow(id), options)
  }

  /**
   * Start a validated definition without persisting it in the shared workflow
   * registry. The first RUNNING snapshot is published synchronously so Remote
   * callers can poll and cancel by id while the run continues in the Host.
   */
  startDefinition(definition: WorkflowDefinition, options: ExecuteWorkflowOptions = {}): WorkflowExecution {
    const detached = clone(definition)
    const issues = validateWorkflow(detached, type => this.nodeLibrary.resolve(type))
    if (issues.length > 0) throw new WorkflowValidationError(issues)
    const executionId = randomUUID()
    const task = this.runDefinition(detached, { ...options, executionId })
    void task.catch(error => {
      this.ctx.logger.error('RunFlow execution %s rejected: %s', executionId, errorMessage(error))
    })
    const execution = this.execution(executionId)
    if (execution === undefined) {
      throw new Error('RunFlow did not publish its initial execution snapshot')
    }
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

  private loadWorkspace(): void {
    if (existsSync(this.storageFile)) {
      try {
        const data = JSON.parse(readFileSync(this.storageFile, 'utf8')) as {
          workflows?: WorkflowDefinition[]
          executions?: WorkflowExecution[]
        }
        for (const workflow of data.workflows ?? []) this.workflows.set(workflow.id, clone(workflow))
        for (const execution of data.executions ?? []) {
          this.executions.set(execution.id, clone(execution))
          this.executionOrder.push(execution.id)
        }
      } catch (error) {
        this.ctx.logger.warn('RunFlow workspace could not be restored: %s', errorMessage(error))
      }
    }
    this.reloadWorkflowFiles(false)
    for (const workflow of this.workflows.values()) {
      if (![...this.workflowFileIds.values()].includes(workflow.id)) this.persistWorkflowFile(workflow)
    }
  }

  private reloadWorkflowFiles(persist = true): void {
    mkdirSync(this.workflowsDir, { recursive: true })
    const previousIds = new Set(this.workflowFileIds.values())
    const nextFiles = new Map<string, string>()
    for (const name of readdirSync(this.workflowsDir).filter(item => item.endsWith('.workflow.json')).sort()) {
      const path = join(this.workflowsDir, name)
      try {
        const workflow = JSON.parse(readFileSync(path, 'utf8')) as WorkflowDefinition
        if (workflow === null || typeof workflow.id !== 'string' || workflow.id.length === 0
          || typeof workflow.name !== 'string' || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.edges)) {
          throw new Error('expected a WorkflowDefinition object')
        }
        this.workflows.set(workflow.id, clone(workflow))
        nextFiles.set(path, workflow.id)
        previousIds.delete(workflow.id)
      } catch (error) {
        this.ctx.logger.warn('RunFlow ignored invalid workflow file %s: %s', path, errorMessage(error))
      }
    }
    for (const id of previousIds) this.workflows.delete(id)
    this.workflowFileIds.clear()
    for (const [path, id] of nextFiles) this.workflowFileIds.set(path, id)
    if (persist) this.persistWorkspace()
  }

  private persistWorkflowFile(workflow: WorkflowDefinition): void {
    mkdirSync(this.workflowsDir, { recursive: true })
    const path = join(this.workflowsDir, workflowFileName(workflow.id))
    const temporary = path + '.' + randomUUID() + '.tmp'
    writeFileSync(temporary, JSON.stringify(workflow, null, 2) + '\n', 'utf8')
    if (existsSync(path)) unlinkSync(path)
    renameSync(temporary, path)
    for (const [currentPath, id] of this.workflowFileIds) {
      if (id === workflow.id && currentPath !== path) this.workflowFileIds.delete(currentPath)
    }
    this.workflowFileIds.set(path, workflow.id)
  }

  private removeWorkflowFile(id: string): void {
    const matches = [...this.workflowFileIds].filter(([, workflowId]) => workflowId === id)
    for (const [path] of matches) {
      if (existsSync(path)) unlinkSync(path)
      this.workflowFileIds.delete(path)
    }
  }

  private watchWorkflowDirectory(): () => void {
    mkdirSync(this.workflowsDir, { recursive: true })
    let timer: ReturnType<typeof setTimeout> | undefined
    let watcher: FSWatcher | undefined
    try {
      watcher = watch(this.workflowsDir, { persistent: false }, () => {
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = undefined
          this.reloadWorkflowFiles()
        }, 120)
      })
      watcher.on('error', error => this.ctx.logger.warn('RunFlow workflow watcher failed: %s', errorMessage(error)))
    } catch (error) {
      this.ctx.logger.warn('RunFlow workflow watcher could not start: %s', errorMessage(error))
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      watcher?.close()
    }
  }

  private persistWorkspace(): void {
    try {
      mkdirSync(dirname(this.storageFile), { recursive: true })
      const executions = this.executionOrder.slice(0, 200)
        .map(id => this.executions.get(id))
        .filter((value): value is WorkflowExecution => value !== undefined)
      writeFileSync(this.storageFile, JSON.stringify({ workflows: this.listWorkflows(), executions }, null, 2), 'utf8')
    } catch (error) {
      this.ctx.logger.warn('RunFlow workspace could not be persisted: %s', errorMessage(error))
    }
  }
  private requireWorkflow(id: string): WorkflowDefinition {
    const workflow = this.workflows.get(id)
    if (workflow === undefined) throw new Error('Workflow not found: ' + id)
    return clone(workflow)
  }

  private async runDefinition(
    workflow: WorkflowDefinition,
    options: ExecuteWorkflowOptions,
  ): Promise<WorkflowExecution> {
    const cancellation = new AbortController()
    const relay = (): void => cancellation.abort(options.signal?.reason)
    options.signal?.addEventListener('abort', relay, { once: true })
    const outputBase = resolve(options.outputDir ?? workflow.outputDir ?? this.defaultOutputDir)
    try {
      return await executeWorkflow(workflow, { ...options, signal: cancellation.signal }, {
        maxParallelNodes: this.maxParallelNodes,
        defaultTimeoutMs: this.defaultTimeoutMs,
        resolveNode: type => this.nodeLibrary.resolve(type),
        createOutput: execution => new FileExecutionOutput(outputBase, workflow, execution),
        onUpdate: snapshot => {
          if (!this.executions.has(snapshot.id)) this.executionOrder.unshift(snapshot.id)
          this.executions.set(snapshot.id, clone(snapshot))
          this.cancellations.set(snapshot.id, cancellation)
          this.persistWorkspace()
        },
      })
    } finally {
      options.signal?.removeEventListener('abort', relay)
      for (const [id, controller] of this.cancellations) {
        if (controller === cancellation) this.cancellations.delete(id)
      }
    }
  }

  private async executeProgramNode(
    program: string,
    descriptor: WorkflowNodeDescriptor,
    context: NodeExecutionContext,
  ): Promise<JsonValue> {
    const service = this.ctx.get('flowNodeExecutor') as {
      runProgram(context: NodeExecutionContext, program: string, descriptor: WorkflowNodeDescriptor): Promise<JsonValue>
    } | undefined
    if (service === undefined) throw new Error('dsh-runflow Node executor is unavailable')
    return await service.runProgram(context, program, descriptor)
  }

  private async executeAgentNode(context: NodeExecutionContext): Promise<JsonValue> {
    if (context.agentId === undefined) {
      throw new Error('DSH Agent nodes require ExecuteWorkflowOptions.agentId as delegation authority')
    }
    const parent = this.ctx.agents.list().find(agent => String(agent.id) === context.agentId)
    if (parent === undefined) throw new Error('live parent Agent not found: ' + context.agentId)

    const availableProviders = this.ctx.subagents.list()
    const providerName = configString(context.node.config, 'subagentProvider') ?? availableProviders[0]
    if (providerName === undefined) throw new Error('no DSH subagent provider is registered')
    const provider = this.ctx.subagents.getProvider(providerName)
    if (provider === undefined) throw new Error('unknown DSH subagent provider: ' + providerName)

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
    context.log('Starting Harness subagent', {
      subagentProvider: providerName,
      modelProvider: agentOptions.provider ?? parent.options.provider ?? null,
      model: agentOptions.model ?? parent.options.model ?? null,
    })
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
      throw new Error(result.diagnostic ?? 'subagent ' + run.id + ' ended with ' + result.stopReason)
    }
    const value = json({
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
    await context.writeIntermediate('subagent-result', value, 'result')
    context.log('Harness subagent completed', { runId: String(run.id), stopReason: result.stopReason })
    return value
  }

  private installBuiltins(): void {
    for (const definition of builtinNodeDefinitions(context => this.executeAgentNode(context))) {
      this.nodeLibrary.registerBuiltin(definition)
    }
  }
}

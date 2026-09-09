import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
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
import {
  FileExecutionRepository,
  FileWorkflowRepository,
} from './backend/v2/file-repositories.ts'
import { createDshAgentNodeExecutor } from './backend/v2/dsh-agent-node.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    flow: FlowService
  }
}

const clone = <T>(value: T): T => structuredClone(value)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)
const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function workflowContent(definition: WorkflowDefinition): string {
  return JSON.stringify({
    id: definition.id,
    name: definition.name,
    nodes: definition.nodes,
    edges: definition.edges,
    outputDir: definition.outputDir ?? null,
    ui: definition.ui ?? null,
  })
}

export class FlowService extends Service {
  private readonly workflowRepository: FileWorkflowRepository
  private readonly executionRepository: FileExecutionRepository
  private readonly cancellations = new Map<string, AbortController>()
  private readonly maxParallelNodes: number
  private readonly defaultTimeoutMs: number
  private readonly defaultOutputDir: string
  private readonly watchFiles: boolean
  readonly nodeLibrary: FlowNodeLibrary
  readonly pluginSources: RunFlowPluginSourceLibrary

  constructor(ctx: Context, config: FlowConfig = {}) {
    super(ctx, 'flow')
    const runtimePaths = resolveRunFlowRuntimePaths(config)
    this.maxParallelNodes = config.maxParallelNodes ?? 4
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30_000
    this.defaultOutputDir = runtimePaths.outputDir
    this.watchFiles = config.watchFiles ?? true
    const warn = (message: string): void => this.ctx.logger.warn(message)
    this.workflowRepository = new FileWorkflowRepository(runtimePaths.workflowsDir, warn)
    this.executionRepository = new FileExecutionRepository(runtimePaths.executionsDir, warn)
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
    if (this.watchFiles) this.ctx.effect(
      () => this.workflowRepository.watch(),
      'dsh-runflow: workflow repository watcher',
    )
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
    return clone(this.nodeLibrary.markTested(type, execution, entry.revision))
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
          models: await Promise.all(models.map(async (model) => {
            const base = {
              id: model.id,
              name: model.name,
              ...(model.description === undefined ? {} : { description: model.description }),
              ...(model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] }),
            }
            try {
              const resolved = await this.ctx.llm.resolveModelInfo(provider.id, model.id)
              return {
                ...base,
                ...(resolved.context === undefined ? {} : { contextWindow: resolved.context.contextWindow }),
                ...(resolved.defaultMaxTokens === undefined ? {} : { defaultMaxTokens: resolved.defaultMaxTokens }),
                ...(resolved.reasoning === undefined
                  ? {}
                  : {
                      reasoning: {
                        efforts: resolved.reasoning.efforts.map(effort => ({
                          id: String(effort.id),
                          name: effort.name,
                          ...(effort.description === undefined ? {} : { description: effort.description }),
                        })),
                        ...(resolved.reasoning.defaultEffort === undefined
                          ? {}
                          : { defaultEffort: String(resolved.reasoning.defaultEffort) }),
                      },
                    }),
              }
            } catch (error) {
              return { ...base, resolutionError: errorMessage(error) }
            }
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
    return this.workflowRepository.list()
  }

  workflow(id: string): WorkflowDefinition | undefined {
    return this.workflowRepository.get(id)
  }

  saveWorkflow(input: WorkflowDefinition): WorkflowDefinition {
    const issues = validateWorkflow(input, type => this.nodeLibrary.resolve(type))
    if (issues.length > 0) throw new WorkflowValidationError(issues)
    const current = this.workflowRepository.get(input.id)
    const now = new Date().toISOString()
    const saved: WorkflowDefinition = {
      ...clone(input),
      version: current === undefined ? Math.max(1, input.version) : current.version + 1,
      createdAt: current?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    }
    return this.workflowRepository.save(saved)
  }

  /** Persist an incoming runnable definition only when its editable content changed. */
  ensureWorkflow(input: WorkflowDefinition): WorkflowDefinition {
    const current = this.workflowRepository.get(input.id)
    if (current !== undefined && workflowContent(current) === workflowContent(input)) return clone(current)
    return this.saveWorkflow(input)
  }

  deleteWorkflow(id: string): boolean {
    return this.workflowRepository.delete(id)
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
    return this.executionRepository.list(workflowId, limit)
  }

  execution(id: string): WorkflowExecution | undefined {
    return this.executionRepository.get(id)
  }

  private requireWorkflow(id: string): WorkflowDefinition {
    const workflow = this.workflowRepository.get(id)
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
    if (options.signal?.aborted) relay()
    const outputBase = resolve(options.outputDir ?? workflow.outputDir ?? this.defaultOutputDir)
    try {
      return await executeWorkflow(workflow, { ...options, signal: cancellation.signal }, {
        maxParallelNodes: this.maxParallelNodes,
        defaultTimeoutMs: this.defaultTimeoutMs,
        resolveNode: type => this.nodeLibrary.resolve(type),
        createOutput: execution => new FileExecutionOutput(outputBase, workflow, execution),
        onUpdate: snapshot => {
          this.executionRepository.save(snapshot)
          this.cancellations.set(snapshot.id, cancellation)
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

  private installBuiltins(): void {
    for (const definition of builtinNodeDefinitions(createDshAgentNodeExecutor(this.ctx))) {
      this.nodeLibrary.registerBuiltin(definition)
    }
  }
}

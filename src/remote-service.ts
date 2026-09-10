import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { JsonValue, WorkflowDefinition, WorkflowExecution } from './contracts.ts'
import type {
  RunFlowStartReceipt,
  RunFlowStartRequest,
  RunFlowWorkspaceSnapshot,
} from './remote-contract.ts'
import type { SaveRunFlowPluginSourceRequest } from './plugin-sources.ts'
import { ensureRunFlowAgentAuthoring } from './authoring-tools.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    runflowRemote: RunFlowRemoteService
  }
}

function executionDefinition(
  definition: WorkflowDefinition,
  targetNodeId: string | undefined,
): WorkflowDefinition {
  if (targetNodeId === undefined) return structuredClone(definition)
  if (!definition.nodes.some(node => node.id === targetNodeId)) {
    throw new Error('RunFlow target node not found: ' + targetNodeId)
  }
  const included = new Set([targetNodeId])
  let changed = true
  while (changed) {
    changed = false
    for (const edge of definition.edges) {
      if (!included.has(edge.to) || included.has(edge.from)) continue
      included.add(edge.from)
      changed = true
    }
  }
  return {
    ...structuredClone(definition),
    name: definition.name + '  -  ' + targetNodeId,
    nodes: definition.nodes.filter(node => included.has(node.id)).map(node => structuredClone(node)),
    edges: definition.edges
      .filter(edge => included.has(edge.from) && included.has(edge.to))
      .map(edge => structuredClone(edge)),
    ...(definition.execution?.mode !== 'state-graph' ? {} : {
      execution: { ...definition.execution,
        ...(definition.execution.entryNodeIds === undefined ? {} : { entryNodeIds: definition.execution.entryNodeIds.filter(id => included.has(id)) }),
      },
    }),
  }
}

/** Agent-authorized UI bridge into the Host-owned RunFlow workspace. */
export class RunFlowRemoteService extends TypertRemoteService {
  static inject = ['flow', 'agents', 'tools']

  constructor(ctx: Context) {
    super(ctx, 'runflowRemote', { namespace: 'runflow' })
  }

  @Remote
  workspace(agent: Agent): RunFlowWorkspaceSnapshot {
    const creationMode = (agent.session?.header as { agentPreset?: string } | undefined)?.agentPreset === this.ctx.flow.authoringPresetId
    if (creationMode) ensureRunFlowAgentAuthoring(this.ctx, this.ctx.flow, agent, this.ctx.flow.authoringPresetId)
    const tools = this.ctx.get('tools') as { get(name: string, scope?: unknown): unknown } | undefined
    const subagents = this.ctx.get('subagents')
    const subagentProviders = subagents?.list().flatMap((id) => {
      const provider = subagents.getProvider(id)
      return provider === undefined
        ? []
        : [{
            id,
            inheritsParentContext: provider.inheritsParentContext,
            capabilities: { ...provider.capabilities },
          }]
    }) ?? []
    return {
      apiVersion: 2,
      workflows: this.ctx.flow.listWorkflows(),
      executions: this.ctx.flow.listExecutions(undefined, 200).filter(execution => this.ctx.flow.executionOwnedBy(execution.id, String(agent.id))),
      nodes: this.ctx.flow.listNodes(),
      subagentProviders,
      capabilities: {
        creationMode,
        runCode: tools?.get('run_code', agent) !== undefined,
        nodeAuthoring: tools?.get('runflow_node', agent) !== undefined,
        sourceAuthoring: creationMode,
        triggers: this.ctx.flow.triggerCapabilities(),
      },
    }
  }

  @Remote
  save(agent: Agent, definition: WorkflowDefinition): WorkflowDefinition {
    return this.ctx.flow.saveWorkflow(structuredClone(definition))
  }

  @Remote
  deleteWorkflow(agent: Agent, workflowId: string): boolean {
    return this.ctx.flow.deleteWorkflow(workflowId)
  }

  @Remote
  start(agent: Agent, request: RunFlowStartRequest): RunFlowStartReceipt {
    const persisted = this.ctx.flow.ensureWorkflow(structuredClone(request.definition))
    const definition = executionDefinition(persisted, request.targetNodeId)
    const execution = this.ctx.flow.startDefinition(definition, {
      trigger: request.targetNodeId === undefined ? 'ui' : 'ui-node-debug',
      agentId: String(agent.id),
      ...(request.input === undefined ? {} : { input: structuredClone(request.input) }),
      ...(request.outputDir === undefined || request.outputDir.trim().length === 0
        ? {}
        : { outputDir: request.outputDir.trim() }),
    })
    return { executionId: execution.id, execution }
  }

  @Remote
  execution(agent: Agent, executionId: string): WorkflowExecution | null {
    this.assertOwner(agent, executionId)
    return this.ctx.flow.execution(executionId) ?? null
  }

  @Remote
  cancel(agent: Agent, executionId: string): boolean {
    this.assertOwner(agent, executionId)
    return this.ctx.flow.cancel(executionId)
  }

  @Remote
  resume(agent: Agent, executionId: string, value: JsonValue): RunFlowStartReceipt {
    this.assertOwner(agent, executionId)
    const execution = this.ctx.flow.resume(executionId, value, { agentId: String(agent.id) })
    return { executionId: execution.id, execution }
  }

  @Remote
  webhook(agent: Agent, workflowId: string) {
    return this.ctx.flow.webhooks.get(agent, workflowId)
  }

  @Remote
  enableWebhook(agent: Agent, workflowId: string, triggerNodeId: string) {
    return this.ctx.flow.webhooks.enable(agent, workflowId, triggerNodeId)
  }

  @Remote
  disableWebhook(agent: Agent, workflowId: string): boolean {
    return this.ctx.flow.webhooks.disable(agent, workflowId)
  }

  @Remote
  sources(agent: Agent) {
    this.assertCreationMode(agent)
    return this.ctx.flow.listPluginSources()
  }

  @Remote
  saveSource(agent: Agent, request: SaveRunFlowPluginSourceRequest) {
    this.assertCreationMode(agent)
    return this.ctx.flow.savePluginSource(request)
  }

  private assertOwner(agent: Agent, executionId: string): void {
    if (!this.ctx.flow.executionOwnedBy(executionId, String(agent.id))) {
      throw new Error('RunFlow execution is not owned by this Agent: ' + executionId)
    }
  }

  private assertCreationMode(agent: Agent): void {
    if ((agent.session?.header as { agentPreset?: string } | undefined)?.agentPreset !== this.ctx.flow.authoringPresetId) {
      throw new Error('Trusted Node/Script source editing is limited to the DSH creation preset')
    }
  }
}

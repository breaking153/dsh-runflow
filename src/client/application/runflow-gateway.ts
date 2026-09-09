import type { WorkflowDefinition, WorkflowExecution } from '../../contracts.ts'
import type { RunFlowPluginSource, SaveRunFlowPluginSourceRequest } from '../../plugin-sources.ts'
import type {
  RunFlowStartReceipt,
  RunFlowStartRequest,
  RunFlowWorkspaceSnapshot,
} from '../../remote-contract.ts'
import type { FlowRuntimeClient } from '../runtime.ts'

export interface RunFlowClientContext {
  agentId: string
}

export interface RunFlowReviewSnapshot {
  workflowId: string
  baseVersion: number
  candidateVersion: number
  status: 'pending' | 'edited' | 'accepted' | 'dismissed'
  origin: 'agent' | 'user' | 'import'
}

export interface RunFlowReviewAcceptance {
  workflowId: string
  candidateVersion: number
  acceptedAt: string
}

export interface RunFlowGatewayV2 {
  readonly version: 2
  workspace: {
    read(context: RunFlowClientContext): Promise<RunFlowWorkspaceSnapshot>
  }
  workflows: {
    save(context: RunFlowClientContext, definition: WorkflowDefinition): Promise<WorkflowDefinition>
    delete(context: RunFlowClientContext, workflowId: string): Promise<boolean>
  }
  executions: {
    start(context: RunFlowClientContext, request: RunFlowStartRequest): Promise<RunFlowStartReceipt>
    read(context: RunFlowClientContext, executionId: string): Promise<WorkflowExecution | null>
    cancel(context: RunFlowClientContext, executionId: string): Promise<boolean>
  }
  sources: {
    list(context: RunFlowClientContext): Promise<RunFlowPluginSource[]>
    save(context: RunFlowClientContext, request: SaveRunFlowPluginSourceRequest): Promise<RunFlowPluginSource>
  }
  /** Reserved until the Host v2 review repository is implemented. */
  reviews: {
    read(context: RunFlowClientContext, workflowId: string): Promise<RunFlowReviewSnapshot | null>
    accept(context: RunFlowClientContext, workflowId: string, candidateVersion: number): Promise<RunFlowReviewAcceptance>
  }
}

export function createRunFlowGatewayV2Adapter(runtime: FlowRuntimeClient): RunFlowGatewayV2 {
  return {
    version: 2,
    workspace: {
      read: context => runtime.workspace(context.agentId),
    },
    workflows: {
      save: (context, definition) => runtime.save(context.agentId, definition),
      delete: (context, workflowId) => runtime.remove(context.agentId, workflowId),
    },
    executions: {
      start: (context, request) => runtime.start(context.agentId, request),
      read: (context, executionId) => runtime.execution(context.agentId, executionId),
      cancel: (context, executionId) => runtime.cancel(context.agentId, executionId),
    },
    sources: {
      list: context => runtime.sources(context.agentId),
      save: (context, request) => runtime.saveSource(context.agentId, request),
    },
    reviews: {
      read: async () => null,
      accept: async () => {
        throw new Error('RUNFLOW_V2_REVIEW_UNAVAILABLE: the connected Host does not expose review persistence')
      },
    },
  }
}

export function requireRunFlowGateway(
  gateway: RunFlowGatewayV2 | undefined,
): RunFlowGatewayV2 {
  if (gateway === undefined) {
    throw new Error('RUNFLOW_HOST_UNAVAILABLE: open a DSH main session before using RunFlow')
  }
  return gateway
}

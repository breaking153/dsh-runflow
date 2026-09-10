import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { JsonValue, WorkflowDefinition, WorkflowExecution } from '../contracts.ts'
import type { RunFlowPluginSource, SaveRunFlowPluginSourceRequest } from '../plugin-sources.ts'
import {
  RUNFLOW_REMOTE,
  type RunFlowStartReceipt,
  type RunFlowWebhookBinding,
  type RunFlowWebhookReceipt,
  type RunFlowStartRequest,
  type RunFlowWorkspaceSnapshot,
} from '../remote-contract.ts'
import {
  createRunFlowGatewayV2Adapter,
  type RunFlowClientContext,
  type RunFlowGatewayV2,
} from './application/runflow-gateway.ts'

export interface FlowRuntimeClient {
  currentAgentId(): string | undefined
  workspace(agentId: string): Promise<RunFlowWorkspaceSnapshot>
  save(agentId: string, definition: WorkflowDefinition): Promise<WorkflowDefinition>
  remove(agentId: string, workflowId: string): Promise<boolean>
  start(agentId: string, request: RunFlowStartRequest): Promise<RunFlowStartReceipt>
  resume(agentId: string, executionId: string, value: JsonValue): Promise<RunFlowStartReceipt>
  webhook(agentId: string, workflowId: string): Promise<RunFlowWebhookBinding | null>
  enableWebhook(agentId: string, workflowId: string, triggerNodeId: string): Promise<RunFlowWebhookReceipt>
  disableWebhook(agentId: string, workflowId: string): Promise<boolean>
  execution(agentId: string, executionId: string): Promise<WorkflowExecution | null>
  cancel(agentId: string, executionId: string): Promise<boolean>
  sources(agentId: string): Promise<RunFlowPluginSource[]>
  saveSource(agentId: string, request: SaveRunFlowPluginSourceRequest): Promise<RunFlowPluginSource>
}

export interface FlowRuntimeSnapshot {
  connected: boolean
  sessionId?: string
  reason?: string
}

const OFFLINE: FlowRuntimeSnapshot = { connected: false }
let snapshot: FlowRuntimeSnapshot = OFFLINE
let activeClient: FlowRuntimeClient | undefined
let activeGateway: RunFlowGatewayV2 | undefined
const listeners = new Set<() => void>()

function publish(next: FlowRuntimeSnapshot): void {
  snapshot = next
  for (const listener of [...listeners]) listener()
}

function unwrap<T>(result: { ok: true; value: T } | {
  ok: false
  error: { code: string; message: string }
}): T {
  if (result.ok) return result.value
  throw new Error(result.error.code + ': ' + result.error.message)
}

export function getFlowRuntime(): FlowRuntimeClient | undefined {
  return activeClient
}

export function getRunFlowGateway(): RunFlowGatewayV2 | undefined {
  return activeGateway
}

export function clientContextForRuntime(
  client: Pick<FlowRuntimeClient, 'currentAgentId'>,
): RunFlowClientContext | undefined {
  const agentId = client.currentAgentId()
  return agentId === undefined ? undefined : { agentId }
}

export function getRunFlowClientContext(): RunFlowClientContext | undefined {
  return activeClient === undefined ? undefined : clientContextForRuntime(activeClient)
}

export function getFlowRuntimeSnapshot(): FlowRuntimeSnapshot {
  return snapshot
}

export function subscribeFlowRuntime(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFlowRuntime(): FlowRuntimeSnapshot {
  return useSyncExternalStore(
    subscribeFlowRuntime,
    getFlowRuntimeSnapshot,
    getFlowRuntimeSnapshot,
  )
}

/** Mount this plugin's Remote descriptor and bind it to the current DSH session. */
export async function connectFlowRuntime(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(RUNFLOW_REMOTE)
  // The mount creates remote.runflow dynamically. Enter a child Cordis
  // scope that explicitly injects it before accessing the namespace; the
  // parent cannot declare it because the mount happens in this apply phase.
  const remoteFiber = ctx.inject(['remote.runflow'], (remoteCtx) => {
    // Both Host and browser packages augment Cordis' `sessions` name. This
    // callback runs in the browser client, so narrow the merged declaration to
    // the controller-owned reactive session facade.
    const sessions = remoteCtx.sessions as unknown as ISessions
    const currentMainAgentId = (): string | undefined => {
      const sessionId = sessions.list.getSnapshot().current
      if (sessionId === undefined || sessions.subagentAddress(sessionId) !== undefined) return undefined
      return sessionId
    }
    const client: FlowRuntimeClient = {
      currentAgentId: currentMainAgentId,
      workspace: async agentId => unwrap(await remoteCtx.remote.runflow.workspace(agentId)),
      save: async (agentId, definition) => unwrap(await remoteCtx.remote.runflow.save(agentId, definition)),
      remove: async (agentId, workflowId) => unwrap(await remoteCtx.remote.runflow.deleteWorkflow(agentId, workflowId)),
      start: async (agentId, request) => unwrap(await remoteCtx.remote.runflow.start(agentId, request)),
      resume: async (agentId, executionId, value) => unwrap(await remoteCtx.remote.runflow.resume(agentId, executionId, value)),
      webhook: async (agentId, workflowId) => unwrap(await remoteCtx.remote.runflow.webhook(agentId, workflowId)),
      enableWebhook: async (agentId, workflowId, triggerNodeId) => unwrap(await remoteCtx.remote.runflow.enableWebhook(agentId, workflowId, triggerNodeId)),
      disableWebhook: async (agentId, workflowId) => unwrap(await remoteCtx.remote.runflow.disableWebhook(agentId, workflowId)),
      execution: async (agentId, executionId) =>
        unwrap(await remoteCtx.remote.runflow.execution(agentId, executionId)),
      cancel: async (agentId, executionId) =>
        unwrap(await remoteCtx.remote.runflow.cancel(agentId, executionId)),
      sources: async agentId => unwrap(await remoteCtx.remote.runflow.sources(agentId)),
      saveSource: async (agentId, request) => unwrap(await remoteCtx.remote.runflow.saveSource(agentId, request)),
    }
    activeClient = client
    activeGateway = createRunFlowGatewayV2Adapter(client)

    const refresh = (): void => {
      const selected = sessions.list.getSnapshot().current
      const sessionId = currentMainAgentId()
      publish({
        connected: true,
        ...(sessionId === undefined ? {} : { sessionId }),
        ...(selected === undefined
          ? { reason: '请先打开一个 DSH 主会话' }
          : sessionId === undefined
            ? { reason: '子 Agent 会话不能作为 RunFlow 的执行主体' }
            : {}),
      })
    }
    const stopSessions = sessions.list.subscribe(refresh)
    refresh()
    return () => {
      stopSessions()
      if (activeClient === client) {
        activeClient = undefined
        activeGateway = undefined
        publish(OFFLINE)
      }
    }
  })
  await remoteFiber

  return async () => {
    await remoteFiber.dispose()
    await disposeRemote()
  }
}

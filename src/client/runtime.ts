import { useSyncExternalStore } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkflowDefinition, WorkflowExecution } from '../contracts.ts'
import type { RunFlowPluginSource, SaveRunFlowPluginSourceRequest } from '../plugin-sources.ts'
import {
  RUNFLOW_REMOTE,
  type RunFlowStartReceipt,
  type RunFlowStartRequest,
  type RunFlowWorkspaceSnapshot,
} from '../remote-contract.ts'

export interface FlowRuntimeClient {
  currentAgentId(): string | undefined
  workspace(agentId: string): Promise<RunFlowWorkspaceSnapshot>
  save(agentId: string, definition: WorkflowDefinition): Promise<WorkflowDefinition>
  remove(agentId: string, workflowId: string): Promise<boolean>
  publish(agentId: string, workflowId: string, published: boolean): Promise<WorkflowDefinition>
  start(agentId: string, request: RunFlowStartRequest): Promise<RunFlowStartReceipt>
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
    const currentMainAgentId = (): string | undefined => {
      const sessionId = remoteCtx.sessions.list.getSnapshot().current
      if (sessionId === undefined || remoteCtx.sessions.subagentAddress(sessionId) !== undefined) return undefined
      return sessionId
    }
    const client: FlowRuntimeClient = {
      currentAgentId: currentMainAgentId,
      workspace: async agentId => unwrap(await remoteCtx.remote.runflow.workspace(agentId)),
      save: async (agentId, definition) => unwrap(await remoteCtx.remote.runflow.save(agentId, definition)),
      remove: async (agentId, workflowId) => unwrap(await remoteCtx.remote.runflow.deleteWorkflow(agentId, workflowId)),
      publish: async (agentId, workflowId, published) => unwrap(await remoteCtx.remote.runflow.publish(agentId, workflowId, published)),
      start: async (agentId, request) => unwrap(await remoteCtx.remote.runflow.start(agentId, request)),
      execution: async (agentId, executionId) =>
        unwrap(await remoteCtx.remote.runflow.execution(agentId, executionId)),
      cancel: async (agentId, executionId) =>
        unwrap(await remoteCtx.remote.runflow.cancel(agentId, executionId)),
      sources: async agentId => unwrap(await remoteCtx.remote.runflow.sources(agentId)),
      saveSource: async (agentId, request) => unwrap(await remoteCtx.remote.runflow.saveSource(agentId, request)),
    }
    activeClient = client

    const refresh = (): void => {
      const selected = remoteCtx.sessions.list.getSnapshot().current
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
    const stopSessions = remoteCtx.sessions.list.subscribe(refresh)
    refresh()
    return () => {
      stopSessions()
      if (activeClient === client) {
        activeClient = undefined
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

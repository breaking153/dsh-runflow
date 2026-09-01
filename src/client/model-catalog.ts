import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'

export interface FlowModelCatalogState {
  sessionId?: string
  current: ModelDirectoryState['current']
  groups: ModelDirectoryState['groups']
  failures: ModelDirectoryState['failures']
  status: ModelDirectoryState['status']
  error: string | null
}

const EMPTY_STATE: FlowModelCatalogState = {
  current: null,
  groups: [],
  failures: [],
  status: 'idle',
  error: null,
}

let snapshot = EMPTY_STATE
const listeners = new Set<() => void>()

function publish(next: FlowModelCatalogState): void {
  snapshot = next
  for (const listener of [...listeners]) listener()
}

export function getFlowModelCatalogSnapshot(): FlowModelCatalogState {
  return snapshot
}

export function subscribeFlowModelCatalog(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useFlowModelCatalog(): FlowModelCatalogState {
  return useSyncExternalStore(
    subscribeFlowModelCatalog,
    getFlowModelCatalogSnapshot,
    getFlowModelCatalogSnapshot,
  )
}

export function modelsForProvider(state: FlowModelCatalogState, providerId: string) {
  return state.groups.find(group => group.id === providerId)?.models ?? []
}

/** Bridge the current DSH session's official shared model directory into the Flow inspector. */
export function connectFlowModelCatalog(ctx: ClientContext): () => void {
  let currentSessionId: string | undefined
  let stopDirectory: (() => void) | undefined
  let generation = 0

  const clearDirectory = (): void => {
    stopDirectory?.()
    stopDirectory = undefined
  }

  const bindCurrentSession = (): void => {
    const sessionId = ctx.sessions.list.getSnapshot().current
    if (sessionId === currentSessionId) return

    currentSessionId = sessionId
    generation += 1
    const activeGeneration = generation
    clearDirectory()

    if (sessionId === undefined) {
      publish(EMPTY_STATE)
      return
    }
    if (ctx.sessions.subagentAddress(sessionId) !== undefined) {
      publish({
        ...EMPTY_STATE,
        sessionId,
        status: 'error',
        error: '模型目录仅在主会话中可用；可继续手工输入 Provider 与 Model ID。',
      })
      return
    }

    try {
      const directory = ctx.modelDirectories.directoryFor(sessionId)
      const publishDirectory = (): void => {
        const state = directory.store.getSnapshot()
        publish({
          sessionId,
          current: state.current,
          groups: state.groups,
          failures: state.failures,
          status: state.status,
          error: state.error,
        })
      }
      stopDirectory = directory.store.subscribe(publishDirectory)
      publishDirectory()
      void directory.load().catch((error: unknown) => {
        if (generation !== activeGeneration) return
        const state = directory.store.getSnapshot()
        publish({
          sessionId,
          current: state.current,
          groups: state.groups,
          failures: state.failures,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      })
    } catch (error) {
      publish({
        ...EMPTY_STATE,
        sessionId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const stopSessions = ctx.sessions.list.subscribe(bindCurrentSession)
  bindCurrentSession()

  return () => {
    generation += 1
    stopSessions()
    clearDirectory()
    currentSessionId = undefined
    publish(EMPTY_STATE)
  }
}

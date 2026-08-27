import { randomUUID } from 'node:crypto'
import type {
  FlowScriptChannelSnapshot,
  FlowScriptExecutionResult,
  FlowScriptRequest,
} from './contracts.ts'

interface ChannelEntry {
  snapshot: FlowScriptChannelSnapshot
  result: Promise<FlowScriptExecutionResult>
  resolve(result: FlowScriptExecutionResult): void
}

export interface FlowScriptChannelTicket {
  requestId: string
  result: Promise<FlowScriptExecutionResult>
}

const clone = <T>(value: T): T => structuredClone(value)

/**
 * Process-local correlation channel for asynchronous run_code work.
 * It publishes immutable snapshots, supports independent waiters, and keeps
 * cancellation ownership in the runner rather than abandoning work.
 */
export class FlowScriptChannel {
  private readonly entries = new Map<string, ChannelEntry>()
  private readonly listeners = new Set<(snapshot: FlowScriptChannelSnapshot) => void>()

  enqueue(request: FlowScriptRequest): FlowScriptChannelTicket {
    const requestId = request.requestId ?? randomUUID()
    if (this.entries.has(requestId)) throw new Error(`flow script request already exists: ${requestId}`)
    const deferred = Promise.withResolvers<FlowScriptExecutionResult>()
    const entry: ChannelEntry = {
      snapshot: {
        requestId,
        executionId: request.executionId,
        nodeId: request.nodeId,
        status: 'queued',
        queuedAt: new Date().toISOString(),
      },
      result: deferred.promise,
      resolve: deferred.resolve,
    }
    this.entries.set(requestId, entry)
    this.publish(entry.snapshot)
    return { requestId, result: entry.result }
  }

  running(requestId: string): FlowScriptChannelSnapshot {
    const entry = this.require(requestId)
    if (entry.snapshot.status !== 'queued') throw new Error(`flow script request is not queued: ${requestId}`)
    entry.snapshot = { ...entry.snapshot, status: 'running', startedAt: new Date().toISOString() }
    this.publish(entry.snapshot)
    return clone(entry.snapshot)
  }

  settle(result: FlowScriptExecutionResult): void {
    const entry = this.require(result.requestId)
    if (entry.snapshot.status === 'success' || entry.snapshot.status === 'error' || entry.snapshot.status === 'cancelled') return
    entry.snapshot = {
      ...entry.snapshot,
      status: result.status,
      finishedAt: result.timing.finishedAt,
      result: clone(result),
    }
    entry.resolve(clone(result))
    this.publish(entry.snapshot)
  }

  wait(requestId: string, signal?: AbortSignal): Promise<FlowScriptExecutionResult> {
    const result = this.require(requestId).result
    if (signal === undefined) return result.then(clone)
    if (signal.aborted) return Promise.reject(signal.reason ?? new Error('script channel wait aborted'))
    return new Promise((resolve, reject) => {
      const onAbort = (): void => reject(signal.reason ?? new Error('script channel wait aborted'))
      signal.addEventListener('abort', onAbort, { once: true })
      result.then(
        value => resolve(clone(value)),
        reject,
      ).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  snapshot(requestId: string): FlowScriptChannelSnapshot | undefined {
    const value = this.entries.get(requestId)?.snapshot
    return value === undefined ? undefined : clone(value)
  }

  list(limit = 100): FlowScriptChannelSnapshot[] {
    return [...this.entries.values()].slice(-Math.max(0, limit)).reverse().map(entry => clone(entry.snapshot))
  }

  subscribe(listener: (snapshot: FlowScriptChannelSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private require(requestId: string): ChannelEntry {
    const entry = this.entries.get(requestId)
    if (entry === undefined) throw new Error(`unknown flow script request: ${requestId}`)
    return entry
  }

  private publish(snapshot: FlowScriptChannelSnapshot): void {
    const detached = clone(snapshot)
    for (const listener of this.listeners) listener(detached)
  }
}
import type { JsonObject, JsonValue } from '../src/contracts.ts'

export type FlowScriptStatus = 'queued' | 'running' | 'success' | 'error' | 'cancelled'

export interface FlowScriptError {
  code: string
  name: string
  message: string
}

export interface FlowScriptTiming {
  queuedAt: string
  startedAt?: string
  finishedAt: string
  durationMs: number
}

/** Request accepted by the in-process script Cordis plugin. */
export interface FlowScriptRequest {
  requestId?: string
  executionId: string
  nodeId: string
  agentId: string
  description: string
  program: string
  input: JsonValue
  inputs?: JsonObject
  config?: JsonObject
  outputDir?: string
  intermediateDir?: string
  signal: AbortSignal
}

/** Lossless, channel-safe terminal result returned to Flow and channel waiters. */
export interface FlowScriptExecutionResult {
  requestId: string
  executionId: string
  nodeId: string
  status: Exclude<FlowScriptStatus, 'queued' | 'running'>
  value?: JsonValue
  logs: string[]
  error?: FlowScriptError
  timing: FlowScriptTiming
  runtime: {
    transport: 'run_code'
    language: string
    agentId: string
  }
}

export interface FlowScriptChannelSnapshot {
  requestId: string
  executionId: string
  nodeId: string
  status: FlowScriptStatus
  queuedAt: string
  startedAt?: string
  finishedAt?: string
  result?: FlowScriptExecutionResult
}
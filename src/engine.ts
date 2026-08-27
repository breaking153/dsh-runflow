import { randomUUID } from 'node:crypto'
import type {
  ExecuteWorkflowOptions,
  JsonObject,
  JsonValue,
  NodeExecutionRecord,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowNode,
  WorkflowNodeDefinition,
  WorkflowValidationIssue,
} from './contracts.ts'

export class WorkflowValidationError extends Error {
  constructor(readonly issues: WorkflowValidationIssue[]) {
    super(issues.map(issue => issue.message).join('; '))
    this.name = 'WorkflowValidationError'
  }
}

export class WorkflowExecutionError extends Error {
  constructor(message: string, readonly code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'WorkflowExecutionError'
  }
}

export function validateWorkflow(definition: WorkflowDefinition): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  if (definition.nodes.length === 0) {
    return [{ code: 'EMPTY_WORKFLOW', message: 'Workflow must contain at least one node' }]
  }

  const ids = new Set<string>()
  for (const node of definition.nodes) {
    if (ids.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE', message: `Duplicate node id: ${node.id}`, nodeId: node.id })
    }
    ids.add(node.id)
  }
  for (const edge of definition.edges) {
    if (!ids.has(edge.from)) {
      issues.push({ code: 'MISSING_NODE', message: `Edge source does not exist: ${edge.from}`, nodeId: edge.from })
    }
    if (!ids.has(edge.to)) {
      issues.push({ code: 'MISSING_NODE', message: `Edge target does not exist: ${edge.to}`, nodeId: edge.to })
    }
    if (edge.from === edge.to) {
      issues.push({ code: 'SELF_EDGE', message: `Node cannot connect to itself: ${edge.from}`, nodeId: edge.from })
    }
  }
  if (issues.length > 0) return issues

  const incoming = new Map(definition.nodes.map(node => [node.id, 0]))
  const outgoing = new Map(definition.nodes.map(node => [node.id, [] as string[]]))
  for (const edge of definition.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
    outgoing.get(edge.from)?.push(edge.to)
  }
  const queue = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  let visited = 0
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    visited += 1
    for (const next of outgoing.get(id) ?? []) {
      const remaining = (incoming.get(next) ?? 1) - 1
      incoming.set(next, remaining)
      if (remaining === 0) queue.push(next)
    }
  }
  if (visited !== definition.nodes.length) {
    issues.push({ code: 'CYCLE', message: 'Workflow contains a cycle; dsh-flow MVP accepts DAGs only' })
  }
  return issues
}

export interface WorkflowEngineOptions {
  maxParallelNodes: number
  defaultTimeoutMs: number
  resolveNode(type: string): WorkflowNodeDefinition | undefined
  onUpdate?(execution: WorkflowExecution): void
}

const clone = <T>(value: T): T => structuredClone(value)
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

function numericConfig(node: WorkflowNode, key: string, fallback: number): number {
  const value = node.config[key]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function incomingFor(nodeId: string, edges: WorkflowEdge[]): WorkflowEdge[] {
  return edges.filter(edge => edge.to === nodeId)
}

function edgeActive(edge: WorkflowEdge, outputs: Map<string, JsonValue>): boolean {
  if (edge.condition === undefined) return true
  const source = outputs.get(edge.from)
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return false
  return source['matched'] === edge.condition
}

function nodeInput(
  node: WorkflowNode,
  definition: WorkflowDefinition,
  outputs: Map<string, JsonValue>,
  triggerInput: JsonValue,
): JsonValue {
  const incoming = incomingFor(node.id, definition.edges).filter(edge => edgeActive(edge, outputs))
  if (incoming.length === 0) return triggerInput
  if (incoming.length === 1) return outputs.get(incoming[0]!.from) ?? null
  return Object.fromEntries(incoming.map(edge => [edge.from, outputs.get(edge.from) ?? null]))
}

function terminalOutput(definition: WorkflowDefinition, outputs: Map<string, JsonValue>): JsonValue {
  const parents = new Set(definition.edges.map(edge => edge.from))
  const terminals = definition.nodes.filter(node => !parents.has(node.id) && outputs.has(node.id))
  if (terminals.length === 1) return outputs.get(terminals[0]!.id) ?? null
  return Object.fromEntries(terminals.map(node => [node.id, outputs.get(node.id) ?? null]))
}

function abortError(signal: AbortSignal): WorkflowExecutionError {
  return new WorkflowExecutionError(
    typeof signal.reason === 'string' ? signal.reason : 'Workflow execution cancelled',
    'FLOW_CANCELLED',
  )
}

async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  ms: number,
  parentSignal: AbortSignal,
): Promise<T> {
  if (parentSignal.aborted) throw abortError(parentSignal)
  const controller = new AbortController()
  const timeout = new WorkflowExecutionError(`Node timed out after ${ms}ms`, 'FLOW_NODE_TIMEOUT')
  const relay = (): void => controller.abort(parentSignal.reason)
  const timer = setTimeout(() => controller.abort(timeout), ms)
  parentSignal.addEventListener('abort', relay, { once: true })
  try {
    const result = await operation(controller.signal)
    if (controller.signal.aborted) {
      if (controller.signal.reason === timeout) throw timeout
      throw abortError(controller.signal)
    }
    return result
  } finally {
    clearTimeout(timer)
    parentSignal.removeEventListener('abort', relay)
  }
}

export async function executeWorkflow(
  definition: WorkflowDefinition,
  options: ExecuteWorkflowOptions,
  engine: WorkflowEngineOptions,
): Promise<WorkflowExecution> {
  const issues = validateWorkflow(definition)
  if (issues.length > 0) throw new WorkflowValidationError(issues)

  const controller = new AbortController()
  const parentSignal = options.signal
  const relayAbort = (): void => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', relayAbort, { once: true })
  const records = new Map<string, NodeExecutionRecord>(definition.nodes.map(node => [node.id, {
    nodeId: node.id,
    status: 'WAITING',
    attempts: 0,
  }]))
  const execution: WorkflowExecution = {
    id: randomUUID(),
    workflowId: definition.id,
    version: definition.version,
    status: 'RUNNING',
    trigger: options.trigger ?? 'manual',
    ...(options.input === undefined ? {} : { input: clone(options.input) }),
    startedAt: new Date().toISOString(),
    nodes: [...records.values()],
  }
  const publish = (): void => {
    execution.nodes = [...records.values()].map(clone)
    engine.onUpdate?.(clone(execution))
  }
  publish()

  const outputs = new Map<string, JsonValue>()
  const completed = new Set<string>()
  const triggerInput = options.input ?? ({} satisfies JsonObject)

  try {
    while (completed.size < definition.nodes.length) {
      if (controller.signal.aborted) throw abortError(controller.signal)
      const ready = definition.nodes.filter(node => !completed.has(node.id)
        && incomingFor(node.id, definition.edges).every(edge => completed.has(edge.from)))
      if (ready.length === 0) throw new WorkflowExecutionError('Workflow made no progress', 'FLOW_STALLED')

      for (let offset = 0; offset < ready.length; offset += engine.maxParallelNodes) {
        const batch = ready.slice(offset, offset + engine.maxParallelNodes)
        await Promise.all(batch.map(async (node) => {
          const record = records.get(node.id)!
          const incoming = incomingFor(node.id, definition.edges)
          const hasActiveInput = incoming.length === 0 || incoming.some(edge => edgeActive(edge, outputs))
          if (node.disabled || !hasActiveInput) {
            record.status = 'SKIPPED'
            record.finishedAt = new Date().toISOString()
            completed.add(node.id)
            publish()
            return
          }

          const provider = engine.resolveNode(node.type)
          if (provider === undefined || provider.available === false) {
            throw new WorkflowExecutionError(`Node provider is unavailable: ${node.type}`, 'FLOW_NODE_UNAVAILABLE')
          }
          const input = nodeInput(node, definition, outputs, triggerInput)
          record.input = clone(input)
          record.status = 'RUNNING'
          record.startedAt = new Date().toISOString()
          publish()

          const retry = Math.min(10, Math.floor(numericConfig(node, 'retry', 0)))
          const timeoutMs = Math.max(1, numericConfig(node, 'timeoutMs', engine.defaultTimeoutMs))
          let lastError: unknown
          for (let attempt = 1; attempt <= retry + 1; attempt += 1) {
            record.attempts = attempt
            try {
              const result = await withTimeout(attemptSignal => provider.execute({
                executionId: execution.id,
                ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
                workflow: definition,
                node,
                input,
                vars: {},
                signal: attemptSignal,
                log() {},
              }), timeoutMs, controller.signal)
              outputs.set(node.id, clone(result))
              record.output = clone(result)
              record.status = 'SUCCESS'
              record.finishedAt = new Date().toISOString()
              record.durationMs = Date.now() - new Date(record.startedAt).getTime()
              completed.add(node.id)
              publish()
              return
            } catch (error) {
              lastError = error
              if (controller.signal.aborted) throw error
            }
          }
          record.status = 'FAILED'
          record.error = errorMessage(lastError)
          record.finishedAt = new Date().toISOString()
          record.durationMs = Date.now() - new Date(record.startedAt).getTime()
          publish()
          throw lastError
        }))
      }
    }
    execution.status = 'SUCCESS'
    execution.output = terminalOutput(definition, outputs)
  } catch (error) {
    const cancelled = controller.signal.aborted
      || (error instanceof WorkflowExecutionError && error.code === 'FLOW_CANCELLED')
    execution.status = cancelled ? 'CANCELLED' : 'FAILED'
    execution.error = errorMessage(error)
    for (const record of records.values()) {
      if (record.status === 'WAITING' || record.status === 'RUNNING') {
        record.status = cancelled ? 'CANCELLED' : 'SKIPPED'
        record.finishedAt = new Date().toISOString()
      }
    }
  } finally {
    execution.finishedAt = new Date().toISOString()
    execution.nodes = [...records.values()].map(clone)
    parentSignal?.removeEventListener('abort', relayAbort)
    publish()
  }
  return clone(execution)
}

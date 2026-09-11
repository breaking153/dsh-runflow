import { randomUUID } from 'node:crypto'
import type {
  ExecuteWorkflowOptions,
  ExecutionArtifact,
  JsonObject,
  JsonValue,
  NodeExecutionLogEntry,
  NodeExecutionRecord,
  NodeControlEnvelope,
  NodeOutputEnvelope,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowExecution,
  WorkflowNode,
  WorkflowNodeDefinition,
  WorkflowPortDescriptor,
  WorkflowValidationIssue,
  WorkflowGraphCheckpoint,
} from './contracts.ts'
import type { ExecutionOutputWriter } from './output-store.ts'
import { executeStateGraph, validateStateGraph } from './state-graph.ts'
import { compatiblePortTypes } from './port-types.ts'
import { effectiveNodeDescriptor, resolveNodeConfig, validPromotedInputs } from './node-properties.ts'
import { completeNodeOutput, validateExecutionDescriptor } from './node-execution.ts'

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

const LEGACY_INPUT: WorkflowPortDescriptor = { id: 'input', label: 'input', type: 'any' }
const LEGACY_OUTPUT: WorkflowPortDescriptor = { id: 'output', label: 'output', type: 'any' }

function inputPorts(provider: WorkflowNodeDefinition | undefined): WorkflowPortDescriptor[] {
  return provider?.inputs === undefined ? [LEGACY_INPUT] : provider.inputs
}

function outputPorts(provider: WorkflowNodeDefinition | undefined): WorkflowPortDescriptor[] {
  return provider?.outputs === undefined ? [LEGACY_OUTPUT] : provider.outputs
}

export function validateWorkflow(
  definition: WorkflowDefinition,
  resolveNode?: (type: string) => WorkflowNodeDefinition | undefined,
): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  if (definition.nodes.length === 0) {
    return [{ code: 'EMPTY_WORKFLOW', message: 'Workflow must contain at least one node' }]
  }

  const ids = new Set<string>()
  const nodes = new Map<string, WorkflowNode>()
  for (const node of definition.nodes) {
    if (ids.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE', message: 'Duplicate node id: ' + node.id, nodeId: node.id })
    }
    ids.add(node.id)
    nodes.set(node.id, node)
    if (node.promotedInputs !== undefined && !validPromotedInputs(node.promotedInputs)) {
      issues.push({ code: 'INVALID_PROPERTY', message: 'Invalid promoted property paths on node ' + node.id, nodeId: node.id })
    }
  }
  for (const edge of definition.edges) {
    if (!ids.has(edge.from)) {
      issues.push({ code: 'MISSING_NODE', message: 'Edge source does not exist: ' + edge.from, nodeId: edge.from })
    }
    if (!ids.has(edge.to)) {
      issues.push({ code: 'MISSING_NODE', message: 'Edge target does not exist: ' + edge.to, nodeId: edge.to })
    }
    if (edge.from === edge.to && definition.execution?.mode !== 'state-graph') {
      issues.push({ code: 'SELF_EDGE', message: 'Node cannot connect to itself: ' + edge.from, nodeId: edge.from })
    }
  }
  if (issues.length > 0) return issues

  if (definition.execution !== undefined && !['dag', 'state-graph'].includes(definition.execution.mode)) {
    return [{ code: 'INVALID_EXECUTION', message: 'Unknown workflow execution mode' }]
  }
  if (definition.execution?.semantics !== undefined && definition.execution.semantics !== 'blueprint') {
    return [{ code: 'INVALID_EXECUTION', message: 'Unknown workflow execution semantics' }]
  }
  if (definition.execution?.mode !== 'state-graph' && definition.nodes.some(node => node.type.startsWith('control.') || node.type.startsWith('state.') && !(node.type === 'state.get' && definition.execution?.semantics === 'blueprint'))) {
    return [{ code: 'INVALID_EXECUTION', message: 'Control and state nodes require state-graph execution mode' }]
  }

  if (resolveNode !== undefined) {
    const descriptors = new Map<string, WorkflowNodeDefinition | undefined>()
    for (const node of definition.nodes) {
      const provider = resolveNode(node.type)
      if (provider !== undefined) {
        try { validateExecutionDescriptor(provider) }
        catch (error) { issues.push({ code: 'INVALID_EXECUTION', message: errorMessage(error), nodeId: node.id }); continue }
      }
      try {
        if (provider === undefined && (node.promotedInputs?.length ?? 0) > 0) throw new Error('Cannot resolve properties for unavailable node provider: ' + node.type)
        descriptors.set(node.id, provider === undefined ? undefined : effectiveNodeDescriptor(node, provider))
      } catch (error) {
        issues.push({ code: 'INVALID_PROPERTY', message: error instanceof Error ? error.message : String(error), nodeId: node.id })
      }
    }
    if (issues.length > 0) return issues
    const incomingCounts = new Map<string, number>()
    for (const edge of definition.edges) {
      const sourceNode = nodes.get(edge.from)
      const targetNode = nodes.get(edge.to)
      if (sourceNode === undefined || targetNode === undefined) continue
      const sourceProvider = descriptors.get(sourceNode.id)
      const targetProvider = descriptors.get(targetNode.id)
      const sourceDescriptors = outputPorts(sourceProvider)
      const targetDescriptors = inputPorts(targetProvider)
      const sourceId = edge.sourcePort ?? sourceDescriptors[0]?.id
      const targetId = edge.targetPort ?? targetDescriptors[0]?.id
      const source = sourceDescriptors.find(port => port.id === sourceId)
      const target = targetDescriptors.find(port => port.id === targetId)
      if (source === undefined) {
        issues.push({
          code: 'UNKNOWN_PORT',
          message: 'Unknown source port ' + String(sourceId) + ' on node ' + edge.from,
          nodeId: edge.from,
        })
      }
      if (target === undefined) {
        issues.push({
          code: 'UNKNOWN_PORT',
          message: 'Unknown target port ' + String(targetId) + ' on node ' + edge.to,
          nodeId: edge.to,
        })
      }
      if (source !== undefined && target !== undefined && !compatiblePortTypes(source.type, target.type)) {
        const compatibleInputs = targetDescriptors.filter(port => compatiblePortTypes(source.type, port.type))
        issues.push({
          code: 'PORT_TYPE_MISMATCH',
          message: source.type + ' output ' + edge.from + '.' + source.id + ' cannot connect to '
            + target.type + ' input ' + edge.to + '.' + target.id
            + (compatibleInputs.length === 0 ? '' : '; compatible input: ' + compatibleInputs.map(port => edge.to + '.' + port.id).join(', ')),
          nodeId: edge.to,
        })
      }
      if (target !== undefined) {
        const key = edge.to + ':' + target.id
        const count = (incomingCounts.get(key) ?? 0) + 1
        incomingCounts.set(key, count)
        if (count > 1 && target.multiple !== true && !(target.type === 'flow' && definition.execution?.semantics === 'blueprint')
          && (definition.execution?.mode !== 'state-graph' || definition.execution?.semantics === 'blueprint' || target.configKey !== undefined)) {
          issues.push({
            code: 'PORT_CARDINALITY',
            message: 'Input port ' + edge.to + '.' + target.id + ' accepts only one connection',
            nodeId: edge.to,
          })
        }
      }
    }
    if (issues.length > 0) return issues
  }

  if (definition.execution?.mode === 'state-graph') return validateStateGraph(definition, resolveNode)

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
    issues.push({ code: 'CYCLE', message: 'Workflow contains a cycle; dsh-runflow accepts DAGs only' })
  }
  if (issues.length === 0 && definition.execution?.semantics === 'blueprint') return validateStateGraph(definition, resolveNode)
  return issues
}

export interface WorkflowEngineOptions {
  maxParallelNodes: number
  defaultTimeoutMs: number
  resolveNode(type: string): WorkflowNodeDefinition | undefined
  createOutput?(execution: WorkflowExecution): Promise<ExecutionOutputWriter | undefined> | ExecutionOutputWriter | undefined
  onUpdate?(execution: WorkflowExecution): void
  onCheckpoint?(checkpoint: WorkflowGraphCheckpoint, execution: WorkflowExecution): Promise<void> | void
  /** Observe actual provider work so Host disposal can drain abort cleanup. */
  onNodeTask?(task: Promise<unknown>): void
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

function edgeActive(
  edge: WorkflowEdge,
  primaryOutputs: Map<string, JsonValue>,
  portOutputs: Map<string, JsonObject>,
): boolean {
  if (!primaryOutputs.has(edge.from)) return false
  if (edge.sourcePort !== undefined && !Object.hasOwn(portOutputs.get(edge.from) ?? {}, edge.sourcePort)) return false
  if (edge.condition === undefined) return true
  const matchedPort = portOutputs.get(edge.from)?.['matched']
  if (typeof matchedPort === 'boolean') return matchedPort === edge.condition
  const source = primaryOutputs.get(edge.from)
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return false
  return source['matched'] === edge.condition
}

function sourcePortValue(
  edge: WorkflowEdge,
  definition: WorkflowDefinition,
  portOutputs: Map<string, JsonObject>,
  primaryOutputs: Map<string, JsonValue>,
  resolveNode: WorkflowEngineOptions['resolveNode'],
): JsonValue {
  const sourceNode = definition.nodes.find(node => node.id === edge.from)
  const provider = sourceNode === undefined ? undefined : resolveNode(sourceNode.type)
  const portId = edge.sourcePort ?? outputPorts(provider)[0]?.id ?? 'output'
  const ports = portOutputs.get(edge.from)
  if (ports !== undefined && Object.hasOwn(ports, portId)) return ports[portId] ?? null
  return edge.sourcePort === undefined ? primaryOutputs.get(edge.from) ?? null : null
}

function nodeInputs(
  node: WorkflowNode,
  definition: WorkflowDefinition,
  primaryOutputs: Map<string, JsonValue>,
  portOutputs: Map<string, JsonObject>,
  triggerInput: JsonValue,
  resolveNode: WorkflowEngineOptions['resolveNode'],
): { input: JsonValue; ports: JsonObject } {
  const provider = resolveNode(node.type)
  const descriptors = inputPorts(provider === undefined ? undefined : effectiveNodeDescriptor(node, provider))
  const incoming = incomingFor(node.id, definition.edges)
    .filter(edge => edgeActive(edge, primaryOutputs, portOutputs))
  if (incoming.length === 0) {
    const first = descriptors.find(port => port.configKey === undefined)
    return {
      input: triggerInput,
      ports: first === undefined ? {} : { [first.id]: triggerInput },
    }
  }

  const ports: JsonObject = {}
  for (const edge of incoming) {
    const targetId = edge.targetPort ?? descriptors[0]?.id ?? 'input'
    const value = sourcePortValue(edge, definition, portOutputs, primaryOutputs, resolveNode)
    const descriptor = descriptors.find(port => port.id === targetId)
    if (descriptor?.multiple === true) {
      const current = ports[targetId]
      ports[targetId] = Array.isArray(current) ? [...current, value] : [value]
    } else {
      ports[targetId] = value
    }
  }
  const ordinaryPorts = Object.fromEntries(Object.entries(ports).filter(([id]) => descriptors.find(port => port.id === id)?.configKey === undefined))
  const values = Object.values(ordinaryPorts)
  return {
    input: values.length === 0 ? triggerInput : values.length === 1 ? values[0] ?? null : ordinaryPorts,
    ports,
  }
}

function isOutputEnvelope(value: JsonValue | NodeOutputEnvelope | NodeControlEnvelope): value is NodeOutputEnvelope {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && value.$runflow === 'port-outputs'
    && typeof value.outputs === 'object' && value.outputs !== null && !Array.isArray(value.outputs)
}

function normalizeOutput(
  value: JsonValue | NodeOutputEnvelope | NodeControlEnvelope,
  provider: WorkflowNodeDefinition,
): { output: JsonValue; ports: JsonObject } {
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && value.$runflow === 'control') {
    throw new WorkflowExecutionError('Control output requires state-graph execution mode', 'FLOW_MODE_REQUIRED')
  }
  if (isOutputEnvelope(value)) {
    const ports = clone(value.outputs)
    const values = Object.values(ports)
    return {
      ports,
      output: ports['output'] ?? (values.length === 1 ? values[0] ?? null : ports),
    }
  }
  const portId = outputPorts(provider)[0]?.id ?? 'output'
  return { output: clone(value as JsonValue), ports: { [portId]: clone(value as JsonValue) } }
}

function terminalOutput(
  definition: WorkflowDefinition,
  primaryOutputs: Map<string, JsonValue>,
  terminalOutputs: Map<string, JsonValue>,
): JsonValue {
  const parents = new Set(definition.edges.map(edge => edge.from))
  const terminals = definition.nodes.filter(node => !parents.has(node.id) && primaryOutputs.has(node.id))
  const valueFor = (id: string): JsonValue => {
    return terminalOutputs.get(id) ?? null
  }
  if (terminals.length === 1) return valueFor(terminals[0]!.id)
  return Object.fromEntries(terminals.map(node => [node.id, valueFor(node.id)]))
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
  const timeout = new WorkflowExecutionError('Node timed out after ' + ms + 'ms', 'FLOW_NODE_TIMEOUT')
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

function memoryArtifact(
  executionId: string,
  nodeId: string,
  label: string,
  value: JsonValue,
  portId?: string,
): ExecutionArtifact {
  const rendered = JSON.stringify(value)
  return {
    kind: 'intermediate',
    nodeId,
    ...(portId === undefined ? {} : { portId }),
    label,
    path: 'memory://' + executionId + '/' + nodeId + '/' + encodeURIComponent(label),
    mediaType: 'application/json',
    bytes: new TextEncoder().encode(rendered).byteLength,
    preview: rendered.length <= 240 ? rendered : rendered.slice(0, 239) + '…',
  }
}

export async function executeWorkflow(
  definition: WorkflowDefinition,
  options: ExecuteWorkflowOptions,
  engine: WorkflowEngineOptions,
): Promise<WorkflowExecution> {
  if (definition.execution?.mode === 'state-graph' || definition.execution?.semantics === 'blueprint') return executeStateGraph(definition, options, engine)
  // Freeze provider identities before validation. Hot reload may replace the
  // registry while this workflow is running, but every node in this execution
  // must observe one coherent provider generation.
  const providerSnapshot = new Map<string, WorkflowNodeDefinition | undefined>()
  for (const node of definition.nodes) {
    if (!providerSnapshot.has(node.type)) providerSnapshot.set(node.type, engine.resolveNode(node.type))
  }
  const resolveNode = (type: string): WorkflowNodeDefinition | undefined => providerSnapshot.get(type)
  const issues = validateWorkflow(definition, resolveNode)
  if (issues.length > 0) throw new WorkflowValidationError(issues)

  definition = { ...definition, edges: definition.edges.map(edge => {
    const source = definition.nodes.find(node => node.id === edge.from)
    const sourcePort = edge.sourcePort ?? outputPorts(source === undefined ? undefined : resolveNode(source.type))[0]?.id
    return { ...edge, ...(sourcePort === undefined ? {} : { sourcePort }) }
  }) }
  const selectedEntries = options.entryNodeIds === undefined ? undefined : new Set(options.entryNodeIds)
  if (selectedEntries !== undefined && (selectedEntries.size === 0 || [...selectedEntries].some(id => !definition.nodes.some(node => node.id === id)))) {
    throw new WorkflowExecutionError('Invalid workflow entry node', 'FLOW_ENTRY_INVALID')
  }
  const reachable = new Set(selectedEntries)
  if (selectedEntries !== undefined) {
    const queue = [...selectedEntries]
    for (let index = 0; index < queue.length; index += 1) {
      for (const edge of definition.edges.filter(edge => edge.from === queue[index])) {
        if (!reachable.has(edge.to)) { reachable.add(edge.to); queue.push(edge.to) }
      }
    }
  }

  const controller = new AbortController()
  const parentSignal = options.signal
  const relayAbort = (): void => controller.abort(parentSignal?.reason)
  parentSignal?.addEventListener('abort', relayAbort, { once: true })
  if (parentSignal?.aborted) relayAbort()
  const records = new Map<string, NodeExecutionRecord>(definition.nodes.map(node => [node.id, {
    nodeId: node.id,
    status: 'WAITING',
    attempts: 0,
    logs: [],
    artifacts: [],
  }]))
  const execution: WorkflowExecution = {
    id: options.executionId ?? randomUUID(),
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

  const primaryOutputs = new Map<string, JsonValue>()
  const portOutputs = new Map<string, JsonObject>()
  const terminalOutputs = new Map<string, JsonValue>()
  const completed = new Set<string>()
  const triggerInput = options.input ?? ({} satisfies JsonObject)
  let writer: ExecutionOutputWriter | undefined

  try {
    // Publish before output initialization so Host callers can receive a stable
    // execution id immediately and begin polling/cancelling the live run.
    publish()
    writer = await engine.createOutput?.(clone(execution))
    if (writer !== undefined) {
      execution.outputDir = writer.outputDir
      await writer.initialize()
    }
    publish()

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
          const hasActiveInput = selectedEntries?.has(node.id) === true || incoming.length === 0
            || incoming.some(edge => edgeActive(edge, primaryOutputs, portOutputs))
          if (node.disabled || !hasActiveInput || selectedEntries !== undefined && !reachable.has(node.id)) {
            record.status = 'SKIPPED'
            record.finishedAt = new Date().toISOString()
            completed.add(node.id)
            publish()
            return
          }

          const provider = resolveNode(node.type)
          if (provider === undefined || provider.available === false) {
            throw new WorkflowExecutionError('Node provider is unavailable: ' + node.type, 'FLOW_NODE_UNAVAILABLE')
          }
          const resolvedInput = nodeInputs(
            node,
            definition,
            primaryOutputs,
            portOutputs,
            triggerInput,
            resolveNode,
          )
          record.input = clone(resolvedInput.input)
          record.inputPorts = clone(resolvedInput.ports)
          record.status = 'RUNNING'
          record.startedAt = new Date().toISOString()
          if (writer !== undefined) {
            record.artifacts?.push(...await writer.writeNodeInput(node.id, resolvedInput.input, resolvedInput.ports))
          }
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
                node: resolveNodeConfig(node, provider, resolvedInput.ports),
                input: resolvedInput.input,
                inputs: resolvedInput.ports,
                vars: {},
                signal: attemptSignal,
                ...(writer === undefined ? {} : {
                  outputDir: joinPath(writer.outputDir, 'nodes', node.id),
                  intermediateDir: joinPath(writer.intermediateRoot, node.id),
                }),
                log(message, data, level = 'info') {
                  const entry: NodeExecutionLogEntry = {
                    timestamp: new Date().toISOString(),
                    level,
                    message,
                    ...(data === undefined ? {} : { data: clone(data) }),
                  }
                  record.logs ??= []
                  record.logs.push(entry)
                  publish()
                },
                async writeIntermediate(label, value, portId) {
                  const artifact = writer === undefined
                    ? memoryArtifact(execution.id, node.id, label, value, portId)
                    : await writer.writeIntermediate(node.id, label, value, portId)
                  record.artifacts ??= []
                  record.artifacts.push(clone(artifact))
                  publish()
                  return clone(artifact)
                },
              }), timeoutMs, controller.signal)
              const normalized = completeNodeOutput(normalizeOutput(result, provider), provider)
              terminalOutputs.set(node.id, clone(normalized.terminalOutput))
              primaryOutputs.set(node.id, clone(normalized.output))
              portOutputs.set(node.id, clone(normalized.ports))
              record.output = clone(normalized.output)
              record.outputPorts = clone(normalized.ports)
              record.status = 'SUCCESS'
              record.finishedAt = new Date().toISOString()
              record.durationMs = Date.now() - new Date(record.startedAt).getTime()
              if (writer !== undefined) record.artifacts?.push(...await writer.writeNodeRecord(record))
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
          if (writer !== undefined) record.artifacts?.push(...await writer.writeNodeRecord(record))
          publish()
          throw lastError
        }))
      }
    }
    execution.status = 'SUCCESS'
    execution.output = terminalOutput(definition, primaryOutputs, terminalOutputs)
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
    if (writer !== undefined) {
      try {
        execution.artifacts = await writer.finalize(clone(execution))
      } catch (error) {
        if (execution.status === 'SUCCESS') {
          execution.status = 'FAILED'
          execution.error = 'Output persistence failed: ' + errorMessage(error)
        }
      }
    }
    parentSignal?.removeEventListener('abort', relayAbort)
    publish()
  }
  return clone(execution)
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replaceAll(/[/\\]+/g, '/')
}

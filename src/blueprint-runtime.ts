import type { JsonObject, JsonValue, WorkflowActivation, WorkflowCallScope, WorkflowDefinition, WorkflowEdge, WorkflowGraphCheckpoint, WorkflowNode, WorkflowNodeDefinition, WorkflowNodeDescriptor } from './contracts.ts'
import { effectiveNodeDescriptor } from './node-properties.ts'
import { WorkflowExecutionError } from './engine.ts'

type ResolveNode = (type: string) => WorkflowNodeDefinition | undefined
const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

export function blueprintExecutionKind(provider: WorkflowNodeDescriptor): 'trigger' | 'pure' | 'effect' {
  return provider.executionKind ?? (provider.category === 'trigger' ? 'trigger' : 'effect')
}

/** Pure arguments are evaluated by their consumer, never scheduled as competing roots. */
export function blueprintEntryNodes(definition: WorkflowDefinition, resolve: ResolveNode): string[] {
  const kind = (node: WorkflowNode): string => {
    const provider = resolve(node.type)
    return provider === undefined ? 'effect' : blueprintExecutionKind(provider)
  }
  const triggers = definition.nodes.filter(node => kind(node) === 'trigger')
  if (triggers.length > 0) return triggers.map(node => node.id)
  const hasEffectAncestor = (id: string, visited = new Set<string>()): boolean => {
    if (visited.has(id)) return false
    visited.add(id)
    return definition.edges.filter(edge => edge.to === id).some(edge => {
      const source = definition.nodes.find(node => node.id === edge.from)!
      return kind(source) !== 'pure' || hasEffectAncestor(source.id, visited)
    })
  }
  const effects = definition.nodes.filter(node => kind(node) !== 'pure')
  if (effects.length > 0) return effects.filter(node => !hasEffectAncestor(node.id)).map(node => node.id)
  const terminals = definition.nodes.filter(node => !definition.edges.some(edge => edge.from === node.id))
  return (terminals.length > 0 ? terminals : definition.nodes).map(node => node.id)
}

export function blueprintFlowEdge(edge: WorkflowEdge, definition: WorkflowDefinition, resolve: ResolveNode): boolean {
  const source = definition.nodes.find(node => node.id === edge.from)
  const provider = source === undefined ? undefined : resolve(source.type)
  const ports = provider?.outputs ?? [{ id: 'output', type: 'any' }]
  return ports.find(port => port.id === (edge.sourcePort ?? ports[0]?.id))?.type === 'flow'
}

/** Validate persisted call channels against the frozen definition before any provider can run. */
export function validBlueprintCheckpoint(checkpoint: WorkflowGraphCheckpoint, definition: WorkflowDefinition, resolve: ResolveNode): boolean {
  if (checkpoint.semantics !== 'blueprint') return false
  const nodes = new Map(definition.nodes.map(node => [node.id, node]))
  const validCall = (call: unknown): call is WorkflowCallScope => {
    if (!object(call) || typeof call.id !== 'string' || call.id.length === 0 || !object(call.outputs)) return false
    return Object.entries(call.outputs).every(([id, ports]) => {
      const node = nodes.get(id)
      if (node === undefined || !object(ports)) return false
      const declared = resolve(node.type)?.outputs ?? [{ id: 'output', type: 'any' }]
      return Object.keys(ports).every(portId => declared.some(port => port.id === portId))
    })
  }
  const validActivation = (activation: WorkflowActivation): boolean => {
    if (!object(activation) || typeof activation.nodeId !== 'string' || !nodes.has(activation.nodeId)
      || activation.value === undefined || !validCall(activation.call)) return false
    if (activation.edgeIndex === undefined) return activation.from === undefined && activation.sourcePort === undefined && activation.targetPort === undefined
    if (typeof activation.edgeIndex !== 'number' || !Number.isSafeInteger(activation.edgeIndex) || activation.edgeIndex < 0) return false
    const edge = definition.edges[activation.edgeIndex]
    if (edge === undefined || edge.to !== activation.nodeId || edge.from !== activation.from || !blueprintFlowEdge(edge, definition, resolve)) return false
    const source = nodes.get(edge.from)!
    const ports = resolve(source.type)?.outputs ?? [{ id: 'output', type: 'any' }]
    return activation.sourcePort === (edge.sourcePort ?? ports[0]?.id) && activation.targetPort === edge.targetPort
  }
  if (!checkpoint.pending.every(validActivation)
    || !Object.entries(checkpoint.joins).every(([nodeId, values]) => nodes.has(nodeId) && Array.isArray(values)
      && values.every(activation => activation.nodeId === nodeId && validActivation(activation)))) return false
  return Object.keys(checkpoint.interrupts).every(nodeId => {
    const record = checkpoint.nodes.find(record => record.nodeId === nodeId)
    return record?.status === 'PAUSED' && typeof record.callId === 'string'
      && checkpoint.pending.some(activation => activation.nodeId === nodeId && activation.call?.id === record.callId)
  })
}

function same(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]!))
  return object(left) && object(right) && Object.keys(left).length === Object.keys(right).length
    && Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && same(value, right[key]!))
}

/** A Join combines only sibling paths; conflicting visits must never silently overwrite data. */
export function mergeBlueprintCalls(messages: WorkflowActivation[]): WorkflowCallScope {
  const first = messages[0]?.call
  if (first === undefined) throw new WorkflowExecutionError('Blueprint activation is missing its call scope', 'FLOW_CALL_INVALID')
  const result = structuredClone(first)
  for (const message of messages.slice(1)) {
    if (message.call?.id !== first.id) throw new WorkflowExecutionError('Cannot join independent Blueprint trigger calls', 'FLOW_CALL_CONFLICT')
    for (const [nodeId, ports] of Object.entries(message.call.outputs)) {
      if (Object.hasOwn(result.outputs, nodeId) && !same(result.outputs[nodeId]!, ports)) {
        throw new WorkflowExecutionError('Joined branches contain conflicting data for node ' + nodeId, 'FLOW_CALL_CONFLICT')
      }
      Object.defineProperty(result.outputs, nodeId, { value: structuredClone(ports), enumerable: true, writable: true, configurable: true })
    }
  }
  return result
}

/** Data supplies arguments from this path; it never enqueues a provider invocation. */
export async function blueprintInputMessages(node: WorkflowNode, messages: WorkflowActivation[], call: WorkflowCallScope,
  definition: WorkflowDefinition, resolve: ResolveNode, demand: (node: WorkflowNode) => Promise<JsonObject>): Promise<WorkflowActivation[]> {
  const provider = resolve(node.type)
  if (provider === undefined) throw new WorkflowExecutionError('Node provider is unavailable: ' + node.type, 'FLOW_NODE_UNAVAILABLE')
  const descriptors = effectiveNodeDescriptor(node, provider).inputs ?? [{ id: 'input', type: 'any' }]
  const result = blueprintExecutionKind(provider) === 'pure' ? messages.filter(item => item.edgeIndex !== undefined) : [...messages]
  for (const [edgeIndex, edge] of definition.edges.entries()) {
    if (edge.to !== node.id || blueprintFlowEdge(edge, definition, resolve)) continue
    const source = definition.nodes.find(item => item.id === edge.from)!
    const sourcePorts = resolve(source.type)?.outputs ?? [{ id: 'output', type: 'any' }]
    const sourcePort = edge.sourcePort ?? sourcePorts[0]?.id
    const targetPort = edge.targetPort ?? descriptors[0]?.id
    const sourceProvider = resolve(source.type)
    const ports = sourceProvider !== undefined && blueprintExecutionKind(sourceProvider) === 'pure'
      ? await demand(source) : Object.hasOwn(call.outputs, source.id) ? call.outputs[source.id] : undefined
    const first = sourcePorts[0]?.id
    const primary = first === undefined ? undefined : ports?.[first]
    const matched = ports?.matched ?? (object(primary) ? primary.matched : undefined)
    if (ports === undefined || sourcePort === undefined || !Object.hasOwn(ports, sourcePort)
      || edge.condition !== undefined && matched !== edge.condition) {
      throw new WorkflowExecutionError('Data input ' + node.id + '.' + String(targetPort) + ' is unavailable in this Blueprint call: ' + source.id + '.' + String(sourcePort), 'FLOW_DATA_UNAVAILABLE')
    }
    result.push({ nodeId: node.id, edgeIndex, from: source.id, sourcePort,
      ...(targetPort === undefined ? {} : { targetPort }), value: structuredClone(ports[sourcePort]!) })
  }
  // A directly selected data-input target uses its wired argument instead of an implicit trigger argument.
  const initialPort = descriptors.find(port => port.configKey === undefined)
  if (initialPort !== undefined && initialPort.type !== 'flow' && result.some(item => item.edgeIndex !== undefined && item.targetPort === initialPort.id)) {
    return result.filter(item => item.edgeIndex !== undefined || item.from !== undefined)
  }
  return result
}

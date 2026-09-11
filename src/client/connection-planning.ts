import { compatiblePortTypes } from '../port-types.ts'
export { compatiblePortTypes } from '../port-types.ts'
import type { Connection, Edge } from '@xyflow/react'
import type { WorkflowNodeDescriptor, WorkflowPortDescriptor, WorkflowPortType } from '../contracts.ts'

export interface PendingNodeConnection {
  direction: 'source' | 'target'
  nodeId: string
  handleId?: string
  portType?: WorkflowPortType
}

interface ConnectableNode {
  id: string
  data: {
    inputs: WorkflowPortDescriptor[]
    outputs: WorkflowPortDescriptor[]
  }
}

interface ConnectionRules {
  mode: 'dag' | 'state-graph'
  semantics?: 'blueprint' | undefined
  edges: readonly Pick<Edge, 'source' | 'target' | 'sourceHandle' | 'targetHandle'>[]
}

function reaches(edges: readonly Pick<Edge, 'source' | 'target'>[], from: string, to: string): boolean {
  const remaining = [from]
  const visited = new Set<string>()
  while (remaining.length > 0) {
    const current = remaining.pop()!
    if (current === to) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of edges) if (edge.source === current) remaining.push(edge.target)
  }
  return false
}

export function graphHasCycle(edges: readonly Pick<Edge, 'source' | 'target'>[]): boolean {
  return edges.some(edge => reaches(edges, edge.target, edge.source))
}

function portForHandle(ports: WorkflowPortDescriptor[], handleId: string | null): WorkflowPortDescriptor | undefined {
  if (handleId !== null) return ports.find(port => port.id === handleId)
  return ports.length === 1 ? ports[0] : undefined
}

export type ConnectionFailureReason = 'missing-node' | 'missing-port' | 'same-direction' | 'type-mismatch' | 'self-loop' | 'cycle' | 'duplicate' | 'input-occupied'
export type ConnectionValidation = { ok: true; connection: Connection; sourceType: WorkflowPortType; targetType: WorkflowPortType }
  | { ok: false; reason: ConnectionFailureReason; sourceType?: WorkflowPortType; targetType?: WorkflowPortType }

interface DragEndpoint { nodeId: string; handleId: string | null; type: 'source' | 'target' }

/** Handle direction is authoritative, including nodes whose input/output share an id. */
export function validateDraggedConnection(nodes: readonly ConnectableNode[], from: DragEndpoint, to: DragEndpoint, rules?: ConnectionRules): ConnectionValidation {
  if (from.type === to.type) return { ok: false, reason: 'same-direction' }
  const [source, target] = from.type === 'source' ? [from, to] : [to, from]
  return validateNodeConnection(nodes, { source: source.nodeId, sourceHandle: source.handleId, target: target.nodeId, targetHandle: target.handleId }, rules)
}

/** Diagnose the candidate before modifying the graph. Reverse drags remain supported. */
export function validateNodeConnection(nodes: readonly ConnectableNode[], connection: Connection | Edge, rules?: ConnectionRules): ConnectionValidation {
  const first = nodes.find(node => node.id === connection.source)
  const second = nodes.find(node => node.id === connection.target)
  if (first === undefined || second === undefined) return { ok: false, reason: 'missing-node' }
  const forwardOutput = portForHandle(first.data.outputs, connection.sourceHandle ?? null)
  const forwardInput = portForHandle(second.data.inputs, connection.targetHandle ?? null)
  const reverseInput = portForHandle(first.data.inputs, connection.sourceHandle ?? null)
  const reverseOutput = portForHandle(second.data.outputs, connection.targetHandle ?? null)
  let output = forwardOutput; let input = forwardInput
  let source = first; let target = second
  if (output === undefined || input === undefined) {
    if (reverseInput !== undefined && reverseOutput !== undefined) { output = reverseOutput; input = reverseInput; source = second; target = first }
    else return { ok: false, reason: (forwardOutput !== undefined && reverseOutput !== undefined) || (reverseInput !== undefined && forwardInput !== undefined) ? 'same-direction' : 'missing-port' }
  }
  const types = { sourceType: output.type, targetType: input.type }
  if (!compatiblePortTypes(output.type, input.type)) return { ok: false, reason: 'type-mismatch', ...types }
  if (source.id === target.id && rules?.mode !== 'state-graph') return { ok: false, reason: 'self-loop', ...types }
  const candidate: Connection = { source: source.id, sourceHandle: output.id, target: target.id, targetHandle: input.id }
  const sourceId = (edge: ConnectionRules['edges'][number]): string | undefined => edge.sourceHandle ?? nodes.find(node => node.id === edge.source)?.data.outputs[0]?.id
  const targetId = (edge: ConnectionRules['edges'][number]): string | undefined => edge.targetHandle ?? nodes.find(node => node.id === edge.target)?.data.inputs[0]?.id
  if (rules?.edges.some(edge => edge.source === source.id && edge.target === target.id && sourceId(edge) === output.id && targetId(edge) === input.id)) return { ok: false, reason: 'duplicate', ...types }
  if (rules?.mode === 'dag' && reaches(rules.edges, target.id, source.id)) return { ok: false, reason: 'cycle', ...types }
  const independentFlow = input.type === 'flow' && rules?.semantics === 'blueprint'
  if (!independentFlow && (input.configKey !== undefined || rules?.mode !== 'state-graph' || rules?.semantics === 'blueprint') && input.multiple !== true && rules?.edges.some(edge => edge.target === target.id && targetId(edge) === input.id)) return { ok: false, reason: 'input-occupied', ...types }
  return { ok: true, connection: candidate, ...types }
}

export function normalizeNodeConnection(nodes: readonly ConnectableNode[], connection: Connection | Edge, rules?: ConnectionRules): Connection | undefined {
  const result = validateNodeConnection(nodes, connection, rules)
  return result.ok ? result.connection : undefined
}

export function connectionFeedbackText(result: ConnectionValidation, language: 'zh' | 'en'): string {
  if (result.ok) return language === 'zh' ? `${result.sourceType} → ${result.targetType} · 松开以连接` : `${result.sourceType} → ${result.targetType} · Release to connect`
  if (result.reason === 'type-mismatch') return language === 'zh' ? `无法连接：${result.sourceType} 输出与 ${result.targetType} 输入不兼容。` : `Cannot connect ${result.sourceType} output to ${result.targetType} input.`
  const messages = {
    'missing-node': ['节点已不可用。', 'This node is no longer available.'],
    'missing-port': ['请拖到可用的输入或输出引脚。', 'Drag to an available input or output pin.'],
    'same-direction': ['只能从输出连接到输入。', 'Connect an output to an input.'],
    'self-loop': ['DAG 模式不允许节点连接自身。', 'A DAG node cannot connect to itself.'],
    cycle: ['此连接将形成循环；请使用状态图模式。', 'This connection creates a cycle. Use state graph mode.'],
    duplicate: ['这两个引脚已经连接。', 'These pins are already connected.'],
    'input-occupied': ['此输入只接受一条连线；请先移除已有连线。', 'This input accepts one connection. Remove its existing link first.'],
  } as const
  return messages[result.reason][language === 'zh' ? 0 : 1]
}

/** Chooses the first compatible port when inserting a node at a dangling connection. */
export function connectionForNewNode(request: PendingNodeConnection, descriptor: WorkflowNodeDescriptor, nodeId: string): Connection | undefined {
  if (request.direction === 'source') {
    const input = (descriptor.inputs ?? []).find(port => request.portType === undefined || compatiblePortTypes(request.portType, port.type))
    if (input === undefined) return undefined
    return {
      source: request.nodeId,
      sourceHandle: request.handleId ?? null,
      target: nodeId,
      targetHandle: input.id,
    }
  }
  const output = (descriptor.outputs ?? []).find(port => request.portType === undefined || compatiblePortTypes(port.type, request.portType))
  if (output === undefined) return undefined
  return {
    source: nodeId,
    sourceHandle: output.id,
    target: request.nodeId,
    targetHandle: request.handleId ?? null,
  }
}

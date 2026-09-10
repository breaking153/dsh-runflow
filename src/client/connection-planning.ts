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
  edges: readonly Pick<Edge, 'source' | 'target'>[]
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

export function compatiblePortTypes(output: WorkflowPortType, input: WorkflowPortType): boolean {
  return output === 'any' || input === 'any' || output === input
}

function portForHandle(ports: WorkflowPortDescriptor[], handleId: string | null): WorkflowPortDescriptor | undefined {
  if (handleId !== null) return ports.find(port => port.id === handleId)
  return ports.length === 1 ? ports[0] : undefined
}

/** Normalizes either drag direction into the executable output -> input direction. */
export function normalizeNodeConnection(nodes: readonly ConnectableNode[], connection: Connection | Edge, rules?: ConnectionRules): Connection | undefined {
  if (connection.source === connection.target && rules?.mode !== 'state-graph') return undefined
  const first = nodes.find(node => node.id === connection.source)
  const second = nodes.find(node => node.id === connection.target)
  if (first === undefined || second === undefined) return undefined

  const forwardOutput = portForHandle(first.data.outputs, connection.sourceHandle ?? null)
  const forwardInput = portForHandle(second.data.inputs, connection.targetHandle ?? null)
  if (forwardOutput !== undefined && forwardInput !== undefined && compatiblePortTypes(forwardOutput.type, forwardInput.type)) {
    if (rules?.mode === 'dag' && reaches(rules.edges, second.id, first.id)) return undefined
    return {
      source: first.id,
      sourceHandle: forwardOutput.id,
      target: second.id,
      targetHandle: forwardInput.id,
    }
  }

  const reverseInput = portForHandle(first.data.inputs, connection.sourceHandle ?? null)
  const reverseOutput = portForHandle(second.data.outputs, connection.targetHandle ?? null)
  if (reverseInput === undefined || reverseOutput === undefined || !compatiblePortTypes(reverseOutput.type, reverseInput.type)) return undefined
  if (rules?.mode === 'dag' && reaches(rules.edges, first.id, second.id)) return undefined
  return {
    source: second.id,
    sourceHandle: reverseOutput.id,
    target: first.id,
    targetHandle: reverseInput.id,
  }
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

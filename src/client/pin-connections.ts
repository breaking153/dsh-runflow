import type { FlowEdge, FlowNode } from './store.ts'

export interface PinAddress {
  nodeId: string
  handleId: string | null
  type: 'source' | 'target'
}
type CapturedEdge = Pick<FlowEdge, 'id' | 'source' | 'target' | 'sourceHandle' | 'targetHandle'>
export interface PinConnectionSnapshot {
  graphIdentity: string
  pin: PinAddress
  edges: CapturedEdge[]
}

export function pinAtElement(target: EventTarget | null): { element: HTMLElement; pin: PinAddress } | undefined {
  if (!(target instanceof Element)) return undefined
  const element = target.closest<HTMLElement>('.react-flow__handle')
  if (element?.dataset.nodeid === undefined) return undefined
  const type = element.classList.contains('target') ? 'target' : element.classList.contains('source') ? 'source' : undefined
  if (type === undefined) return undefined
  return { element, pin: { nodeId: element.dataset.nodeid, handleId: element.dataset.handleid || null, type } }
}

export function capturePinConnections(nodes: readonly FlowNode[], edges: readonly FlowEdge[], pin: PinAddress, graphIdentity: string): PinConnectionSnapshot {
  const node = nodes.find(node => node.id === pin.nodeId)
  const ports = pin.type === 'target' ? node?.data.inputs : node?.data.outputs
  const handleId = pin.handleId ?? ports?.[0]?.id
  const captured = edges.filter(edge => pin.type === 'target'
    ? edge.target === pin.nodeId && (edge.targetHandle ?? ports?.[0]?.id) === handleId
    : edge.source === pin.nodeId && (edge.sourceHandle ?? ports?.[0]?.id) === handleId)
  return { graphIdentity, pin, edges: captured.map(({ id, source, target, sourceHandle, targetHandle }) => ({ id, source, target, ...(sourceHandle === undefined ? {} : { sourceHandle }), ...(targetHandle === undefined ? {} : { targetHandle }) })) }
}

/** Re-check both graph and endpoints: a pending gesture never owns newly added or rewired links. */
export function capturedPinEdgeIds(snapshot: PinConnectionSnapshot, graphIdentity: string, edges: readonly FlowEdge[]): string[] {
  if (snapshot.graphIdentity !== graphIdentity) return []
  const current = new Map(edges.map(edge => [edge.id, edge]))
  return snapshot.edges.filter(edge => {
    const candidate = current.get(edge.id)
    return candidate !== undefined && candidate.source === edge.source && candidate.target === edge.target
      && candidate.sourceHandle === edge.sourceHandle && candidate.targetHandle === edge.targetHandle
  }).map(edge => edge.id)
}

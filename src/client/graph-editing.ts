import type { FlowEdge, FlowNode, FlowSubflow } from './store.ts'

export interface GraphSnapshot {
  nodes: FlowNode[]
  edges: FlowEdge[]
  subflows?: FlowSubflow[]
  rootGraphSnapshot?: GraphSnapshot | undefined
}

export interface GraphHistory {
  past: GraphSnapshot[]
  future: GraphSnapshot[]
  limit: number
}

export interface GraphHistoryStep {
  history: GraphHistory
  snapshot: GraphSnapshot
}

export interface GraphFragment {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

function cloneSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return structuredClone(snapshot)
}

export function createGraphHistory(limit = 80): GraphHistory {
  return { past: [], future: [], limit }
}

export function pushGraphHistory(history: GraphHistory, snapshot: GraphSnapshot): GraphHistory {
  return {
    ...history,
    past: [...history.past, cloneSnapshot(snapshot)].slice(-history.limit),
    future: [],
  }
}

export function undoGraphHistory(history: GraphHistory, current: GraphSnapshot): GraphHistoryStep {
  const snapshot = history.past.at(-1)
  if (snapshot === undefined) return { history, snapshot: cloneSnapshot(current) }
  return {
    snapshot: cloneSnapshot(snapshot),
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [cloneSnapshot(current), ...history.future].slice(0, history.limit),
    },
  }
}

export function redoGraphHistory(history: GraphHistory, current: GraphSnapshot): GraphHistoryStep {
  const snapshot = history.future[0]
  if (snapshot === undefined) return { history, snapshot: cloneSnapshot(current) }
  return {
    snapshot: cloneSnapshot(snapshot),
    history: {
      ...history,
      past: [...history.past, cloneSnapshot(current)].slice(-history.limit),
      future: history.future.slice(1),
    },
  }
}

export function readGraphFragment(nodes: FlowNode[], edges: FlowEdge[], fallbackNodeId?: string): GraphFragment {
  const selected = nodes.filter(node => node.selected || node.id === fallbackNodeId)
  const ids = new Set(selected.map(node => node.id))
  return {
    nodes: structuredClone(selected).map(node => {
      const { executionRecord: _executionRecord, ...data } = node.data
      return { ...node, selected: false, data: { ...data, status: 'WAITING' } }
    }),
    edges: structuredClone(edges.filter(edge => ids.has(edge.source) && ids.has(edge.target))).map(edge => ({ ...edge, selected: false })),
  }
}

function uniqueId(existing: Set<string>, createId: () => string): string {
  let id = createId()
  while (existing.has(id)) id = createId()
  existing.add(id)
  return id
}

export function pasteGraphFragment(
  fragment: GraphFragment,
  existingNodes: FlowNode[],
  existingEdges: FlowEdge[],
  createId = () => 'paste-' + crypto.randomUUID(),
  offset = { x: 36, y: 36 },
): GraphFragment {
  const nodeIds = new Set(existingNodes.map(node => node.id))
  const edgeIds = new Set(existingEdges.map(edge => edge.id))
  const remap = new Map<string, string>()
  const nodes = fragment.nodes.map(node => {
    const id = uniqueId(nodeIds, createId)
    remap.set(node.id, id)
    const copy = structuredClone(node)
    const { executionRecord: _executionRecord, ...data } = copy.data
    return {
      ...copy,
      id,
      selected: true,
      position: { x: node.position.x + offset.x, y: node.position.y + offset.y },
      data: { ...data, status: 'WAITING' as const },
    }
  })
  const remappedNodes = nodes.map(node => node.data.memberNodeIds === undefined ? node : ({
    ...node,
    data: { ...node.data, memberNodeIds: node.data.memberNodeIds.flatMap(id => remap.get(id) ?? []) },
  }))
  const edges = fragment.edges.flatMap(edge => {
    const source = remap.get(edge.source)
    const target = remap.get(edge.target)
    if (source === undefined || target === undefined) return []
    return [{ ...structuredClone(edge), id: uniqueId(edgeIds, createId), source, target, selected: false }]
  })
  return { nodes: remappedNodes, edges }
}

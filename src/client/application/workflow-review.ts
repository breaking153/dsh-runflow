import type { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../../contracts.ts'

export type WorkflowReviewOrigin = 'agent' | 'user' | 'import'
export type WorkflowReviewStatus = 'pending' | 'edited' | 'accepted' | 'dismissed'
export type WorkflowChangeKind =
  | 'workflow.changed'
  | 'node.added'
  | 'node.changed'
  | 'node.removed'
  | 'edge.added'
  | 'edge.removed'

export interface WorkflowChange {
  id: string
  kind: WorkflowChangeKind
  subjectId: string
  before?: unknown
  after?: unknown
}

export interface WorkflowReviewDiagnostic {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  nodeId?: string
}

export interface WorkflowReviewSession {
  id: string
  workflowId: string
  origin: WorkflowReviewOrigin
  status: WorkflowReviewStatus
  baseVersion: number
  candidateVersion: number
  candidate: WorkflowDefinition
  changes: WorkflowChange[]
  diagnostics: WorkflowReviewDiagnostic[]
  createdAt: string
  acceptedAt?: string
}

export interface CreateWorkflowReviewOptions {
  origin: WorkflowReviewOrigin
  expectedBaseVersion?: number
  diagnostics?: WorkflowReviewDiagnostic[]
  createdAt?: string
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function edgeId(edge: WorkflowEdge): string {
  return edge.id ?? [
    edge.from,
    edge.sourcePort ?? 'output',
    edge.to,
    edge.targetPort ?? 'input',
    edge.condition === undefined ? '' : String(edge.condition),
  ].join(':')
}

function workflowChanges(base: WorkflowDefinition, candidate: WorkflowDefinition): WorkflowChange[] {
  const changes: WorkflowChange[] = []
  for (const field of ['name', 'outputDir'] as const) {
    if (same(base[field], candidate[field])) continue
    changes.push({
      id: 'workflow:' + field,
      kind: 'workflow.changed',
      subjectId: field,
      before: base[field],
      after: candidate[field],
    })
  }

  const baseNodes = new Map(base.nodes.map(node => [node.id, node]))
  const candidateNodes = new Map(candidate.nodes.map(node => [node.id, node]))
  const addedNodes = candidate.nodes.filter(node => !baseNodes.has(node.id))
  const removedNodes = base.nodes.filter(node => !candidateNodes.has(node.id))
  const changedNodes = candidate.nodes.filter((node) => {
    const previous = baseNodes.get(node.id)
    return previous !== undefined && !same(previous, node)
  })
  const appendNode = (kind: Extract<WorkflowChangeKind, `node.${string}`>, node: WorkflowNode): void => {
    changes.push({
      id: kind + ':' + node.id,
      kind,
      subjectId: node.id,
      ...(kind === 'node.added' ? { after: node } : {}),
      ...(kind === 'node.removed' ? { before: node } : {}),
      ...(kind === 'node.changed' ? { before: baseNodes.get(node.id), after: node } : {}),
    })
  }
  changedNodes.toSorted((a, b) => a.id.localeCompare(b.id)).forEach(node => appendNode('node.changed', node))
  addedNodes.toSorted((a, b) => a.id.localeCompare(b.id)).forEach(node => appendNode('node.added', node))
  removedNodes.toSorted((a, b) => a.id.localeCompare(b.id)).forEach(node => appendNode('node.removed', node))

  const baseEdges = new Map(base.edges.map(edge => [edgeId(edge), edge]))
  const candidateEdges = new Map(candidate.edges.map(edge => [edgeId(edge), edge]))
  for (const [id, edge] of [...candidateEdges].filter(([id]) => !baseEdges.has(id)).toSorted(([a], [b]) => a.localeCompare(b))) {
    changes.push({ id: 'edge.added:' + id, kind: 'edge.added', subjectId: id, after: edge })
  }
  for (const [id, edge] of [...baseEdges].filter(([id]) => !candidateEdges.has(id)).toSorted(([a], [b]) => a.localeCompare(b))) {
    changes.push({ id: 'edge.removed:' + id, kind: 'edge.removed', subjectId: id, before: edge })
  }
  return changes
}

export function createWorkflowReview(
  base: WorkflowDefinition,
  candidate: WorkflowDefinition,
  options: CreateWorkflowReviewOptions,
): WorkflowReviewSession {
  if (base.id !== candidate.id) {
    throw new Error('RUNFLOW_REVIEW_WORKFLOW_MISMATCH: candidate workflow id does not match the editor')
  }
  if (options.expectedBaseVersion !== undefined && base.version !== options.expectedBaseVersion) {
    throw new Error('RUNFLOW_REVIEW_STALE_BASE: editor revision changed before the candidate was staged')
  }
  return {
    id: 'review:' + base.id + ':' + String(base.version) + ':' + String(candidate.version),
    workflowId: base.id,
    origin: options.origin,
    status: 'pending',
    baseVersion: base.version,
    candidateVersion: candidate.version,
    candidate: structuredClone(candidate),
    changes: workflowChanges(base, candidate),
    diagnostics: structuredClone(options.diagnostics ?? []),
    createdAt: options.createdAt ?? new Date().toISOString(),
  }
}

export function markReviewEdited(review: WorkflowReviewSession): WorkflowReviewSession {
  if (review.status !== 'pending') return structuredClone(review)
  return { ...structuredClone(review), status: 'edited' }
}

export function acceptWorkflowReview(
  review: WorkflowReviewSession,
  acceptedAt = new Date().toISOString(),
): WorkflowReviewSession {
  return { ...structuredClone(review), status: 'accepted', acceptedAt }
}

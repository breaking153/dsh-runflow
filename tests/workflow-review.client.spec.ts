import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import {
  acceptWorkflowReview,
  createWorkflowReview,
  markReviewEdited,
} from '../src/client/application/workflow-review.ts'

const base: WorkflowDefinition = {
  id: 'ai-review',
  name: 'Research flow',
  version: 4,
  outputDir: 'old-output',
  nodes: [
    { id: 'manual', type: 'trigger.manual', name: 'Start', config: {}, position: { x: 10, y: 20 } },
    { id: 'agent', type: 'dsh.agent', name: 'Research', config: { prompt: 'Old' }, position: { x: 240, y: 20 } },
    { id: 'removed', type: 'builtin.noop', config: {}, position: { x: 480, y: 20 } },
  ],
  edges: [
    { id: 'manual-agent', from: 'manual', to: 'agent', sourcePort: 'output', targetPort: 'flow' },
    { id: 'agent-removed', from: 'agent', to: 'removed' },
  ],
}

describe('AI workflow review domain', () => {
  it('classifies metadata, node, and edge changes in deterministic order', () => {
    const candidate: WorkflowDefinition = {
      ...structuredClone(base),
      name: 'Research and summarize',
      version: 5,
      outputDir: 'new-output',
      nodes: [
        base.nodes[0]!,
        { ...base.nodes[1]!, config: { prompt: 'Investigate {{input}}', maxDepth: 2 } },
        { id: 'storage', type: 'storage.write', name: 'Save result', config: {}, position: { x: 480, y: 20 } },
      ],
      edges: [
        base.edges[0]!,
        { id: 'agent-storage', from: 'agent', to: 'storage', sourcePort: 'result', targetPort: 'input' },
      ],
    }

    const review = createWorkflowReview(base, candidate, { origin: 'agent' })

    expect(review.status).toBe('pending')
    expect(review.baseVersion).toBe(4)
    expect(review.candidateVersion).toBe(5)
    expect(review.changes.map(change => [change.kind, change.subjectId])).toEqual([
      ['workflow.changed', 'name'],
      ['workflow.changed', 'outputDir'],
      ['node.changed', 'agent'],
      ['node.added', 'storage'],
      ['node.removed', 'removed'],
      ['edge.added', 'agent-storage'],
      ['edge.removed', 'agent-removed'],
    ])
  })

  it('preserves Agent provenance after user editing and acceptance', () => {
    const pending = createWorkflowReview(base, { ...structuredClone(base), version: 5 }, { origin: 'agent' })
    const edited = markReviewEdited(pending)
    const accepted = acceptWorkflowReview(edited, '2026-09-02T12:00:00.000Z')

    expect(edited).toEqual(expect.objectContaining({ origin: 'agent', status: 'edited' }))
    expect(accepted).toEqual(expect.objectContaining({
      origin: 'agent', status: 'accepted', acceptedAt: '2026-09-02T12:00:00.000Z',
    }))
    expect(pending.status).toBe('pending')
  })

  it('rejects a candidate created from a stale editor revision', () => {
    expect(() => createWorkflowReview(base, { ...structuredClone(base), version: 5 }, {
      origin: 'agent',
      expectedBaseVersion: 3,
    })).toThrow('RUNFLOW_REVIEW_STALE_BASE')
  })

  it('rejects candidates for a different workflow', () => {
    expect(() => createWorkflowReview(base, { ...structuredClone(base), id: 'other-flow' }, {
      origin: 'agent',
    })).toThrow('RUNFLOW_REVIEW_WORKFLOW_MISMATCH')
  })
})

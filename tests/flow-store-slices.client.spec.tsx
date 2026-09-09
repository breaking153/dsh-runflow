// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import { makeNode, useFlowStore } from '../src/client/store.ts'
import { selectInspectorTab, selectReviewSummary } from '../src/client/state/selectors.ts'

const base: WorkflowDefinition = {
  id: 'agent-draft',
  name: 'Agent draft',
  version: 2,
  nodes: [{ id: 'manual', type: 'trigger.manual', name: 'Start', config: {}, position: { x: 20, y: 20 } }],
  edges: [],
}

beforeEach(() => {
  const manual = makeNode('manual', 'trigger.manual', { x: 20, y: 20 }, {}, 'Start')
  manual.selected = true
  manual.data.status = 'SUCCESS'
  manual.data.executionRecord = { nodeId: 'manual', status: 'SUCCESS', attempts: 1, output: { ok: true } }
  useFlowStore.setState({
    workflows: [structuredClone(base)],
    workflowId: base.id,
    workflowName: base.name,
    workflowOutputDir: '',
    version: base.version,
    nodes: [manual],
    edges: [],
    subflows: [],
    selectedNodeId: 'manual',
    selectedExecutionId: 'execution-previous',
    review: undefined,
    inspectorTab: undefined,
    dirty: false,
  })
})

describe('composed RunFlow store slices', () => {
  it('stages an Agent candidate without losing editor selection or run evidence', () => {
    const candidate: WorkflowDefinition = {
      ...structuredClone(base),
      version: 3,
      nodes: [
        ...base.nodes,
        { id: 'agent', type: 'dsh.agent', name: 'Research', config: { prompt: 'Review {{input}}' }, position: { x: 260, y: 20 } },
      ],
      edges: [{ id: 'manual-agent', from: 'manual', to: 'agent', sourcePort: 'output', targetPort: 'flow' }],
    }

    useFlowStore.getState().stageWorkflowReview(candidate, { origin: 'agent', expectedBaseVersion: 2 })
    const state = useFlowStore.getState()

    expect(state.review).toEqual(expect.objectContaining({ status: 'pending', origin: 'agent', candidateVersion: 3 }))
    expect(state.nodes.map(node => node.id)).toEqual(['manual', 'agent'])
    expect(state.nodes[0]?.selected).toBe(true)
    expect(state.nodes[0]?.data.executionRecord?.output).toEqual({ ok: true })
    expect(state.selectedExecutionId).toBe('execution-previous')
    expect(selectInspectorTab(state)).toBe('review')
    expect(selectReviewSummary(state)).toEqual({ additions: 2, removals: 0, changes: 0, errors: 0 })
  })

  it('marks an Agent review edited on the first user graph change and can accept it', () => {
    useFlowStore.getState().stageWorkflowReview({ ...structuredClone(base), version: 3 }, { origin: 'agent' })
    useFlowStore.getState().updateNode('manual', { label: 'Start here' })
    expect(useFlowStore.getState().review?.status).toBe('edited')

    useFlowStore.getState().acceptReview('2026-09-02T12:00:00.000Z')
    expect(useFlowStore.getState().review).toEqual(expect.objectContaining({
      status: 'accepted', acceptedAt: '2026-09-02T12:00:00.000Z', origin: 'agent',
    }))
  })

  it('marks structural graph edits as human adjustments to an Agent review', () => {
    useFlowStore.getState().stageWorkflowReview({
      ...structuredClone(base),
      version: 3,
      nodes: [
        ...base.nodes,
        { id: 'agent', type: 'dsh.agent', name: 'Research', config: {}, position: { x: 260, y: 20 } },
      ],
    }, { origin: 'agent' })

    useFlowStore.getState().onConnect({ source: 'manual', sourceHandle: 'output', target: 'agent', targetHandle: 'flow' })

    expect(useFlowStore.getState().review?.status).toBe('edited')
  })

  it('clears review state without clearing the current node selection', () => {
    useFlowStore.getState().stageWorkflowReview({ ...structuredClone(base), version: 3 }, { origin: 'agent' })
    useFlowStore.getState().dismissReview()
    expect(useFlowStore.getState().review?.status).toBe('dismissed')
    useFlowStore.getState().clearReview()
    expect(useFlowStore.getState().review).toBeUndefined()
    expect(useFlowStore.getState().selectedNodeId).toBe('manual')
    expect(selectInspectorTab(useFlowStore.getState())).toBe('parameters')
  })
})

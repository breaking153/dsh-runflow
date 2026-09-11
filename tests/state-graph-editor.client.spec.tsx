// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import { makeEdge, makeNode, useFlowStore } from '../src/client/store.ts'
import { normalizeNodeConnection } from '../src/client/connection-planning.ts'

const graphSettings = { mode: 'state-graph' as const, maxSteps: 42, entryNodeIds: ['start'], initialState: { count: 0 }, reducers: { count: 'sum' as const } }
const graph: WorkflowDefinition = { id: 'state-fixture', name: 'State fixture', version: 1, nodes: [{ id: 'start', type: 'trigger.manual', config: {} }], edges: [], execution: graphSettings }

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ workflows: [graph, { ...graph, id: 'other', name: 'Other' }], workflowId: 'other', dirty: false })
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('state graph editor contracts', () => {
  it('preserves execution settings across opening, editing, saving and reopening workflows', async () => {
    useFlowStore.getState().openWorkflow(graph.id)
    expect(useFlowStore.getState().definition().execution).toEqual(graphSettings)
    useFlowStore.getState().setWorkflowName('Edited state graph')
    await useFlowStore.getState().save()
    useFlowStore.getState().openWorkflow('other')
    useFlowStore.getState().openWorkflow(graph.id)
    expect(useFlowStore.getState().definition().execution).toEqual(graphSettings)
    expect(useFlowStore.getState().workflowName).toBe('Edited state graph')
  })

  it('preserves settings in an Agent review and starts newly created workflows in state graph mode', () => {
    useFlowStore.getState().openWorkflow(graph.id)
    useFlowStore.getState().stageWorkflowReview({ ...graph, version: 2, execution: { ...graphSettings, maxSteps: 80 } }, { origin: 'agent' })
    expect(useFlowStore.getState().definition().execution?.maxSteps).toBe(80)
    useFlowStore.getState().createWorkflow()
    expect(useFlowStore.getState().definition().execution?.mode).toBe('state-graph')
  })

  it('rejects a cycle in DAG mode while accepting it in state graph mode', () => {
    const a = makeNode('a', 'builtin.noop', { x: 0, y: 0 })
    const b = makeNode('b', 'builtin.noop', { x: 200, y: 0 })
    const edge = { source: 'a', sourceHandle: 'output', target: 'b', targetHandle: 'flow' }
    const reverse = { source: 'b', sourceHandle: 'output', target: 'a', targetHandle: 'flow' }
    const edges = [makeEdge('a', 'b', 'a-b', 'flow', 'flow')]
    expect(normalizeNodeConnection([a, b], reverse, { mode: 'dag', edges })).toBeUndefined()
    expect(normalizeNodeConnection([a, b], reverse, { mode: 'state-graph', edges })).toEqual(reverse)
    expect(normalizeNodeConnection([a, b], edge, { mode: 'dag', edges: [] })).toEqual(edge)
  })

  it('permits a type-compatible self-loop only in state graph mode', () => {
    const a = makeNode('a', 'builtin.noop', { x: 0, y: 0 })
    const edge = { source: 'a', sourceHandle: 'output', target: 'a', targetHandle: 'flow' }
    expect(normalizeNodeConnection([a], edge, { mode: 'dag', edges: [] })).toBeUndefined()
    expect(normalizeNodeConnection([a], edge, { mode: 'state-graph', edges: [] })).toEqual(edge)
  })
})

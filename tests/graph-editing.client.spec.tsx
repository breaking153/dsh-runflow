// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { FlowEdge, FlowNode } from '../src/client/store.ts'
import {
  createGraphHistory,
  pasteGraphFragment,
  pushGraphHistory,
  readGraphFragment,
  redoGraphHistory,
  undoGraphHistory,
} from '../src/client/graph-editing.ts'
import { commandForKeyboardEvent, isEditableEventTarget, resetEditorKeybindings, setEditorKeybinding } from '../src/client/editor-commands.ts'
import { useFlowStore } from '../src/client/store.ts'
import { rankNodeDescriptors } from '../src/client/node-search.ts'
import { connectionForNewNode, normalizeNodeConnection } from '../src/client/connection-planning.ts'
import { FLOW_STYLES } from '../src/client/styles.ts'

function node(id: string, x: number, selected = false): FlowNode {
  return {
    id,
    type: 'workflow',
    position: { x, y: 20 },
    selected,
    data: {
      label: id,
      nodeType: 'fixture.' + id,
      description: '',
      color: '#2563eb',
      icon: 'workflow',
      status: 'WAITING',
      config: {},
      inputs: [],
      outputs: [],
    },
  }
}

function edge(id: string, source: string, target: string): FlowEdge {
  return { id, source, target }
}

describe('React Flow connection rendering', () => {
  it('keeps edge SVGs positioned and unclipped', () => {
    expect(FLOW_STYLES).toContain('.react-flow__edges{position:absolute;pointer-events:none;overflow:visible}')
    expect(FLOW_STYLES).toContain('.react-flow__edges svg{position:absolute;overflow:visible;pointer-events:none}')
    expect(FLOW_STYLES).toContain('.react-flow__edge{pointer-events:visibleStroke}')
  })

  it('renders a visible DSH-blue primary-button selection marquee', () => {
    expect(FLOW_STYLES).toContain('.react-flow__pane.selection{cursor:crosshair}')
    expect(FLOW_STYLES).toContain('.react-flow__selection{z-index:6;box-sizing:border-box;pointer-events:none;border:1.5px solid')
    expect(FLOW_STYLES).toContain('12%,transparent)!important')
  })
})

describe('typed node connections', () => {
  const source = (): FlowNode => ({
    ...node('source', 10),
    data: { ...node('source', 10).data, outputs: [{ id: 'result', type: 'json' }] },
  })
  const target = (): FlowNode => ({
    ...node('target', 100),
    data: { ...node('target', 100).data, inputs: [{ id: 'payload', type: 'any' }] },
  })

  it('normalizes a connection dragged from an input handle to an output handle', () => {
    expect(normalizeNodeConnection([source(), target()], {
      source: 'target', sourceHandle: 'payload', target: 'source', targetHandle: 'result',
    })).toEqual({
      source: 'source', sourceHandle: 'result', target: 'target', targetHandle: 'payload',
    })
  })

  it('plans an automatic edge when a node is created from either handle direction', () => {
    const descriptor = {
      type: 'fixture.transform', title: 'Transform', description: '', category: 'action' as const,
      color: '#2563eb', icon: 'workflow', inputs: [{ id: 'input', type: 'any' as const }], outputs: [{ id: 'output', type: 'json' as const }],
    }
    expect(connectionForNewNode({ direction: 'source', nodeId: 'origin', handleId: 'result', portType: 'json' }, descriptor, 'created')).toEqual({
      source: 'origin', sourceHandle: 'result', target: 'created', targetHandle: 'input',
    })
    expect(connectionForNewNode({ direction: 'target', nodeId: 'origin', handleId: 'payload', portType: 'any' }, descriptor, 'created')).toEqual({
      source: 'created', sourceHandle: 'output', target: 'origin', targetHandle: 'payload',
    })
  })

  it('adds a node and its dangling-handle edge as one undoable transaction', () => {
    const origin = source()
    const descriptor = {
      type: 'fixture.transform', title: 'Transform', description: '', category: 'action' as const,
      color: '#2563eb', icon: 'workflow', inputs: [{ id: 'input', type: 'any' as const }], outputs: [{ id: 'output', type: 'json' as const }],
    }
    useFlowStore.setState({ nodes: [origin], edges: [], graphHistory: createGraphHistory(), dirty: false })
    const id = useFlowStore.getState().addConnectedNode(descriptor, { x: 200, y: 80 }, {
      direction: 'source', nodeId: 'source', handleId: 'result', portType: 'json',
    })
    const connected = useFlowStore.getState()
    expect(connected.nodes.map(item => item.id)).toContain(id)
    expect(connected.edges).toEqual([expect.objectContaining({
      source: 'source', sourceHandle: 'result', target: id, targetHandle: 'input',
    })])
    expect(connected.graphHistory.past).toHaveLength(1)

    connected.undoGraph()
    expect(useFlowStore.getState().nodes.map(item => item.id)).toEqual(['source'])
    expect(useFlowStore.getState().edges).toEqual([])
  })
})

describe('graph transaction history', () => {
  it('undoes and redoes a multi-node movement as one transaction', () => {
    const original = { nodes: [node('a', 10, true), node('b', 40, true)], edges: [edge('ab', 'a', 'b')] }
    const moved = { ...original, nodes: [node('a', 110, true), node('b', 140, true)] }
    const committed = pushGraphHistory(createGraphHistory(), original)

    const undone = undoGraphHistory(committed, moved)
    expect(undone.snapshot.nodes.map(item => item.position.x)).toEqual([10, 40])
    expect(undone.history.future).toHaveLength(1)

    const redone = redoGraphHistory(undone.history, undone.snapshot)
    expect(redone.snapshot.nodes.map(item => item.position.x)).toEqual([110, 140])
    expect(redone.history.past).toHaveLength(1)
  })

  it('bounds stored history without mutating snapshots', () => {
    let history = createGraphHistory(2)
    history = pushGraphHistory(history, { nodes: [node('a', 1)], edges: [] })
    history = pushGraphHistory(history, { nodes: [node('a', 2)], edges: [] })
    history = pushGraphHistory(history, { nodes: [node('a', 3)], edges: [] })
    expect(history.past.map(item => item.nodes[0]?.position.x)).toEqual([2, 3])
  })
})

describe('graph clipboard', () => {
  it('copies internal edges and pastes a selected, offset graph with unique ids', () => {
    const nodes = [node('a', 10, true), node('b', 60, true), node('outside', 120)]
    const edges = [edge('ab', 'a', 'b'), edge('bo', 'b', 'outside')]
    const fragment = readGraphFragment(nodes, edges)

    expect(fragment.nodes.map(item => item.id)).toEqual(['a', 'b'])
    expect(fragment.edges.map(item => item.id)).toEqual(['ab'])

    let sequence = 0
    const pasted = pasteGraphFragment(fragment, nodes, edges, () => 'copy-' + ++sequence)
    expect(pasted.nodes.map(item => item.id)).toEqual(['copy-1', 'copy-2'])
    expect(pasted.nodes.map(item => item.position.x)).toEqual([46, 96])
    expect(pasted.nodes.every(item => item.selected)).toBe(true)
    expect(pasted.edges[0]).toMatchObject({ id: 'copy-3', source: 'copy-1', target: 'copy-2' })
  })
})

describe('editor command routing', () => {
  it('protects native typing while allowing non-editing modifier commands', () => {
    const input = document.createElement('input')
    expect(isEditableEventTarget(input)).toBe(true)
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'a' }), input)).toBeUndefined()
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }), input)).toBeUndefined()
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }), input)).toBe('workflow.run')
  })

  it('maps platform-neutral graph shortcuts', () => {
    const canvas = document.createElement('div')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }), canvas)).toBe('graph.undo')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'Z', metaKey: true, shiftKey: true }), canvas)).toBe('graph.redo')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }), canvas)).toBe('graph.selectAll')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'Backspace' }), canvas)).toBe('graph.delete')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'Delete' }), canvas)).toBe('graph.delete')
  })

  it('applies and resets a user keybinding override', () => {
    setEditorKeybinding('graph.addNode', 'Ctrl J')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'j', ctrlKey: true }), document.body)).toBe('graph.addNode')
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'a', shiftKey: true }), document.body)).toBeUndefined()
    resetEditorKeybindings()
    expect(commandForKeyboardEvent(new KeyboardEvent('keydown', { key: 'a', shiftKey: true }), document.body)).toBe('graph.addNode')
  })
})

describe('visual graph organization', () => {
  it('persists groups as UI metadata without sending them to execution', () => {
    useFlowStore.setState({
      workflowId: 'group-flow', workflowName: 'Group flow', version: 1,
      nodes: [node('a', 10, true), node('b', 70, true)],
      edges: [edge('ab', 'a', 'b')], graphHistory: createGraphHistory(),
    })
    useFlowStore.getState().groupSelection()
    const state = useFlowStore.getState()
    expect(state.nodes.filter(item => item.type === 'runflow-group')).toHaveLength(1)
    expect(state.definition().nodes.map(item => item.id)).toEqual(['a', 'b'])
    expect(state.definition().ui?.groups[0]?.nodeIds).toEqual(['a', 'b'])
  })

  it('flattens reroute segments back to one executable edge', () => {
    useFlowStore.setState({
      workflowId: 'reroute-flow', workflowName: 'Reroute flow', version: 1,
      nodes: [node('a', 10), node('b', 170)],
      edges: [edge('ab', 'a', 'b')], graphHistory: createGraphHistory(),
    })
    useFlowStore.getState().insertReroute('ab', { x: 100, y: 40 })
    const definition = useFlowStore.getState().definition()
    expect(definition.ui?.reroutes).toHaveLength(1)
    expect(definition.ui?.visualEdges).toHaveLength(2)
    expect(definition.edges).toEqual([expect.objectContaining({ from: 'a', to: 'b' })])
  })
})

describe('node discovery ranking', () => {
  it('prefers title prefix matches, then description and type matches', () => {
    const base = { description: '', category: 'action' as const, color: '#2563eb', icon: 'workflow' }
    const ranked = rankNodeDescriptors([
      { ...base, type: 'data.http', title: 'HTTP Request', description: 'Fetch a remote JSON document' },
      { ...base, type: 'http.transform', title: 'Transform', description: 'Process HTTP response' },
      { ...base, type: 'script.javascript', title: 'JavaScript', description: 'Execute code' },
    ], 'http')
    expect(ranked.map(item => item.type)).toEqual(['data.http', 'http.transform'])
  })
})

describe('workflow tabs', () => {
  it('opens, switches, reorders and closes workflow tabs by id', async () => {
    const workflow = (id: string) => ({ id, name: id.toUpperCase(), version: 1, nodes: [], edges: [] })
    useFlowStore.setState({ workflows: [workflow('a'), workflow('b')], workflowId: 'a', dirty: false, openWorkflowIds: ['a'] })
    useFlowStore.getState().openWorkflow('b')
    expect(useFlowStore.getState().openWorkflowIds).toEqual(['a', 'b'])
    useFlowStore.getState().reorderWorkflowTabs('b', 'a')
    expect(useFlowStore.getState().openWorkflowIds).toEqual(['b', 'a'])
    await useFlowStore.getState().closeWorkflowTab('b')
    expect(useFlowStore.getState().openWorkflowIds).toEqual(['a'])
    expect(useFlowStore.getState().workflowId).toBe('a')
  })
})

describe('executable subflows', () => {
  it('collapses a selection in the editor and expands it for Host execution', () => {
    const s = node('source', -100)
    const a = node('a', 10, true)
    const b = node('b', 70, true)
    const t = node('target', 200)
    useFlowStore.setState({
      workflowId: 'subflow-flow', workflowName: 'Subflow flow', version: 1,
      nodes: [s, a, b, t], edges: [edge('sa', 'source', 'a'), edge('ab', 'a', 'b'), edge('bt', 'b', 'target')],
      subflows: [], activeSubflowId: undefined, rootGraphSnapshot: undefined, graphHistory: createGraphHistory(),
    })
    useFlowStore.getState().createSubflowFromSelection()
    const collapsed = useFlowStore.getState()
    expect(collapsed.nodes.map(item => item.type)).toContain('runflow-subflow')
    expect(collapsed.nodes.map(item => item.id)).not.toContain('a')
    const definition = collapsed.definition()
    expect(definition.ui?.subflows).toHaveLength(1)
    expect(definition.nodes.map(item => item.id)).toEqual(expect.arrayContaining(['source', 'a', 'b', 'target']))
    expect(definition.edges.map(item => [item.from, item.to])).toEqual(expect.arrayContaining([['source', 'a'], ['a', 'b'], ['b', 'target']]))

    const id = collapsed.subflows[0]!.id
    collapsed.enterSubflow(id)
    expect(useFlowStore.getState().nodes.map(item => item.id)).toEqual(['a', 'b'])
    useFlowStore.getState().exitSubflow()
    expect(useFlowStore.getState().nodes.some(item => item.id === id)).toBe(true)
  })

  it('preserves executable subflow boundaries through visual reroutes', () => {
    useFlowStore.setState({
      workflowId: 'rerouted-subflow', workflowName: 'Rerouted subflow', version: 1,
      nodes: [node('source', -100), node('a', 10, true), node('b', 70, true), node('target', 200)],
      edges: [edge('sa', 'source', 'a'), edge('ab', 'a', 'b'), edge('bt', 'b', 'target')],
      subflows: [], activeSubflowId: undefined, rootGraphSnapshot: undefined, graphHistory: createGraphHistory(),
    })
    useFlowStore.getState().createSubflowFromSelection()
    const collapsed = useFlowStore.getState()
    const proxyId = collapsed.subflows[0]!.id
    const inputEdge = collapsed.edges.find(item => item.target === proxyId)
    expect(inputEdge).toBeDefined()
    collapsed.insertReroute(inputEdge!.id, { x: 40, y: 20 })
    const definition = useFlowStore.getState().definition()
    expect(definition.edges.map(item => [item.from, item.to])).toEqual(expect.arrayContaining([
      ['source', 'a'], ['a', 'b'], ['b', 'target'],
    ]))
    expect(definition.edges.some(item => item.from.startsWith('reroute-') || item.to.startsWith('reroute-'))).toBe(false)
  })
})

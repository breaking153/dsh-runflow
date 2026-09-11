// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactFlowProps } from '@xyflow/react'
import { FlowApp } from '../src/client/App.tsx'
import { makeNode, useFlowStore, type FlowNode } from '../src/client/store.ts'
import { descriptorFor } from '../src/client/catalog.tsx'
const captured = vi.hoisted(() => ({ props: {} as ReactFlowProps<FlowNode>, fitView: vi.fn(async () => true), nodesInitialized: true, viewportInitialized: true }))
vi.mock('@xyflow/react', async original => ({ ...await original<typeof import('@xyflow/react')>(), ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, ReactFlow: (props: ReactFlowProps<FlowNode>) => { captured.props = props; return <div className="react-flow__pane">{props.children}</div> }, Background: () => null, MiniMap: () => null, Controls: () => null, useNodesInitialized: () => captured.nodesInitialized, useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point, fitView: captured.fitView, viewportInitialized: captured.viewportInitialized, zoomIn: vi.fn(), zoomOut: vi.fn() }) }))
vi.mock('../src/client/InspectorPanel.tsx', () => ({ InspectorPanel: () => <div>Inspector</div> }))
let host: HTMLDivElement; let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); useFlowStore.setState(useFlowStore.getInitialState(), true)
  captured.fitView.mockClear()
  captured.nodesInitialized = true; captured.viewportInitialized = true
  useFlowStore.setState({ view: 'editor', nodes: [makeNode('a', 'builtin.noop', { x: 0, y: 0 }), makeNode('b', 'builtin.noop', { x: 200, y: 0 })], edges: [], selectedNodeId: undefined, dirty: false })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
it('fits a fresh editor only after every node and the viewport are initialized', async () => {
  captured.nodesInitialized = false; captured.viewportInitialized = false
  await act(async () => root.render(<FlowApp />))
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.props.fitView).not.toBe(true)
  expect(captured.fitView).not.toHaveBeenCalled()
  captured.nodesInitialized = true
  await act(async () => root.render(<FlowApp />))
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.fitView).not.toHaveBeenCalled()
  captured.viewportInitialized = true
  await act(async () => root.render(<FlowApp />))
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.fitView).toHaveBeenCalledTimes(1)
})
it.each([undefined, 'blueprint'] as const)('accepts flow reuse through validation, release, and insertion with %s semantics', async semantics => {
  const source = makeNode('source', 'trigger.manual', { x: 0, y: 0 })
  const existing = makeNode('existing', 'trigger.manual', { x: 0, y: 200 })
  const target = makeNode('target', 'builtin.wait', { x: 300, y: 0 })
  const candidate = { source: source.id, sourceHandle: 'output', target: target.id, targetHandle: 'flow' }
  useFlowStore.setState({ workflowExecution: { mode: 'dag', ...(semantics === undefined ? {} : { semantics }) }, nodes: [source, existing, target], edges: [{ id: 'existing-link', ...candidate, source: existing.id }] })
  await act(async () => root.render(<FlowApp />))
  expect(captured.props.isValidConnection?.(candidate)).toBe(true)
  await act(async () => captured.props.onConnect?.(candidate))
  await act(async () => captured.props.onConnectEnd?.(new MouseEvent('mouseup'), { fromNode: source, fromHandle: { id: 'output', type: 'source' }, toNode: target, toHandle: { id: 'flow', type: 'target' }, isValid: true } as never))
  expect(host.querySelector('.connection-feedback[role="alert"]')).toBeNull()
  expect(useFlowStore.getState().edges).toHaveLength(2)
  await act(async () => useFlowStore.getState().addConnectedNode(descriptorFor('trigger.manual'), { x: -300, y: 0 }, { direction: 'target', nodeId: target.id, handleId: 'flow', portType: 'flow' }))
  expect(useFlowStore.getState().edges).toHaveLength(3)
})
it('fits each newly opened graph once without moving the view during edits or selection', async () => {
  await act(async () => root.render(<FlowApp />))
  await act(async () => vi.advanceTimersByTimeAsync(50))
  captured.fitView.mockClear()
  await act(async () => { useFlowStore.setState({ workflowId: 'another-workflow' }); await vi.advanceTimersByTimeAsync(50) })
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.fitView).toHaveBeenCalledTimes(1)
  await act(async () => {
    useFlowStore.getState().onNodesChange([{ id: 'a', type: 'position', position: { x: 100, y: 100 }, dragging: true }])
    useFlowStore.getState().selectNode('a')
  })
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.fitView).toHaveBeenCalledTimes(1)
  await act(async () => useFlowStore.setState({ activeSubflowId: 'subflow' }))
  await act(async () => vi.advanceTimersByTimeAsync(50))
  expect(captured.fitView).toHaveBeenCalledTimes(2)
})
it('keeps the inspector closed during a node drag but opens it on a deliberate click', async () => {
  await act(async () => root.render(<FlowApp />))
  expect(captured.props.selectNodesOnDrag).toBe(false)
  const node = useFlowStore.getState().nodes[0]!
  await act(async () => captured.props.onNodeDragStart?.({} as never, node, [node]))
  await act(async () => { useFlowStore.getState().onNodesChange([{ id: 'a', type: 'select', selected: true }]); captured.props.onSelectionChange?.({ nodes: [node], edges: [] }) })
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(true)
  await act(async () => captured.props.onNodeDragStop?.({} as never, node, [node]))
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(true)
  await act(async () => captured.props.onNodeClick?.({} as never, node))
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(false)
})
it('keeps inspector layout stable while marquee selection passes across nodes', async () => {
  useFlowStore.setState({ selectedNodeId: 'a', nodes: useFlowStore.getState().nodes.map(node => ({ ...node, selected: node.id === 'a' })) })
  await act(async () => root.render(<FlowApp />))
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(false)
  await act(async () => captured.props.onSelectionStart?.({} as never))
  await act(async () => { useFlowStore.getState().onNodesChange([{ id: 'b', type: 'select', selected: true }]); captured.props.onSelectionChange?.({ nodes: useFlowStore.getState().nodes, edges: [] }) })
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(false)
  await act(async () => captured.props.onSelectionEnd?.({} as never))
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(true)
})
it('persists group resize dimensions and restores them with one undo step', () => {
  useFlowStore.getState().selectAllNodes(); useFlowStore.getState().groupSelection()
  const group = useFlowStore.getState().nodes.find(node => node.type === 'runflow-group')!
  const original = useFlowStore.getState().definition().ui!.groups[0]!
  useFlowStore.setState({ dirty: false, graphHistory: { past: [], future: [], limit: 80 } })
  useFlowStore.getState().beginGraphGesture()
  useFlowStore.getState().onNodesChange([{ id: group.id, type: 'dimensions', dimensions: { width: 600, height: 440 }, setAttributes: true, resizing: true }])
  useFlowStore.getState().onNodesChange([{ id: group.id, type: 'dimensions', resizing: false }])
  useFlowStore.getState().endGraphGesture()
  expect(useFlowStore.getState().definition().ui!.groups[0]).toMatchObject({ width: 600, height: 440 })
  expect(useFlowStore.getState().dirty).toBe(true)
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(1)
  useFlowStore.getState().undoGraph()
  expect(useFlowStore.getState().definition().ui!.groups[0]).toEqual(original)
})
it('does not autosave a held drag before the gesture is committed', async () => {
  const save = vi.fn(async () => undefined); useFlowStore.setState({ save })
  useFlowStore.getState().beginGraphGesture()
  useFlowStore.getState().onNodesChange([{ id: 'a', type: 'position', position: { x: 64, y: 32 }, dragging: true }])
  await vi.advanceTimersByTimeAsync(450)
  expect(save).not.toHaveBeenCalled()
  useFlowStore.getState().endGraphGesture()
  await vi.advanceTimersByTimeAsync(350)
  expect(save).toHaveBeenCalledTimes(1)
})
it('explains a rejected connection on release without adding an edge or opening node search', async () => {
  const current = useFlowStore.getState().nodes
  const source = { ...current[0]!, data: { ...current[0]!.data, outputs: [{ id: 'out', type: 'number' as const }] } }
  const target = { ...current[1]!, data: { ...current[1]!.data, inputs: [{ id: 'in', type: 'text' as const }] } }
  useFlowStore.setState({ nodes: [source, target] })
  await act(async () => root.render(<FlowApp />))
  await act(async () => captured.props.onConnectEnd?.(new MouseEvent('mouseup'), { fromNode: source, fromHandle: { id: 'out', type: 'source' }, toNode: target, toHandle: { id: 'in', type: 'target' }, isValid: false } as never))
  expect(host.querySelector('.connection-feedback[role="alert"]')?.textContent).toContain('Cannot connect number output to text input')
  expect(useFlowStore.getState().edges).toHaveLength(0)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
})
it('continues to show a node selected with the keyboard when no pointer gesture is active', async () => {
  await act(async () => root.render(<FlowApp />))
  const node = useFlowStore.getState().nodes[0]!
  await act(async () => { useFlowStore.getState().onNodesChange([{ id: node.id, type: 'select', selected: true }]); captured.props.onSelectionChange?.({ nodes: [node], edges: [] }) })
  expect(useFlowStore.getState().selectedNodeId).toBe(node.id)
  expect(host.querySelector('.inspector-wrap')?.classList.contains('closed')).toBe(false)
})

it('ends a resize handle click without movement so later edits still autosave', async () => {
  const save = vi.fn(async () => undefined); useFlowStore.setState({ save })
  useFlowStore.getState().beginGraphGesture()
  window.dispatchEvent(new Event('pointerup'))
  await vi.advanceTimersByTimeAsync(1)
  expect(useFlowStore.getState().graphGestureSnapshot).toBeUndefined()
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(0)
  useFlowStore.getState().setWorkflowName('Edited after resize click')
  await vi.advanceTimersByTimeAsync(350)
  expect(save).toHaveBeenCalledTimes(1)
})

it('keeps the resize gesture open when a form field loses focus inside the window', async () => {
  const save = vi.fn(async () => undefined); useFlowStore.setState({ save })
  const input = document.createElement('input'); host.append(input)
  useFlowStore.getState().beginGraphGesture()
  input.dispatchEvent(new FocusEvent('blur'))
  await vi.advanceTimersByTimeAsync(1)
  expect(useFlowStore.getState().graphGestureSnapshot).toBeDefined()
  useFlowStore.getState().onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 40 }, dragging: true }])
  await vi.advanceTimersByTimeAsync(350)
  expect(save).not.toHaveBeenCalled()
  window.dispatchEvent(new Event('pointerup'))
  await vi.advanceTimersByTimeAsync(350)
  expect(save).toHaveBeenCalledTimes(1)
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(1)
})

it('explains occupied input on release of a reverse drag with same-named handles', async () => {
  const [source, target] = useFlowStore.getState().nodes
  const existing = makeNode('c', 'builtin.noop', { x: 0, y: 240 })
  for (const node of [source!, target!, existing]) {
    node.data.inputs = [{ id: 'value', type: 'number' }]
    node.data.outputs = [{ id: 'value', type: 'number' }]
  }
  useFlowStore.setState({ nodes: [source!, target!, existing], workflowExecution: { mode: 'state-graph', semantics: 'blueprint' }, edges: [{ id: 'existing', source: 'c', sourceHandle: 'value', target: 'b', targetHandle: 'value' }] })
  await act(async () => root.render(<FlowApp />))
  await act(async () => captured.props.onConnectEnd?.(new MouseEvent('mouseup'), { fromNode: target, fromHandle: { id: 'value', type: 'target' }, toNode: source, toHandle: { id: 'value', type: 'source' }, isValid: false } as never))
  expect(host.querySelector('.connection-feedback[role="alert"]')?.textContent).toContain('This input accepts one connection')
  expect(useFlowStore.getState().edges).toHaveLength(1)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
})

// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReactFlowProps } from '@xyflow/react'
import { FlowApp } from '../src/client/App.tsx'
import { FloatingRunFlowWindow } from '../src/client/FloatingRunFlowWindow.tsx'
import { makeNode, useFlowStore, type FlowNode } from '../src/client/store.ts'

const captured = vi.hoisted(() => ({ props: {} as ReactFlowProps<FlowNode> }))
vi.mock('@xyflow/react', async original => ({
  ...await original<typeof import('@xyflow/react')>(),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ReactFlow: (props: ReactFlowProps<FlowNode>) => {
    captured.props = props
    return <div className="react-flow__pane">{props.nodes?.map(node => <div key={node.id}>
      {(['target', 'source'] as const).flatMap(type => (type === 'target' ? node.data.inputs : node.data.outputs).map(port => <div key={type + port.id} tabIndex={0} className={'react-flow__handle ' + type} data-nodeid={node.id} data-handleid={port.id} />))}
    </div>)}{props.children}</div>
  },
  Background: () => null, MiniMap: () => null, Controls: () => null,
  useNodesInitialized: () => false,
  useReactFlow: () => ({ screenToFlowPosition: (point: unknown) => point, fitView: vi.fn(), viewportInitialized: false, zoomIn: vi.fn(), zoomOut: vi.fn() }),
}))
vi.mock('../src/client/InspectorPanel.tsx', () => ({ InspectorPanel: () => <input aria-label="Inspector value" /> }))

let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  const nodes = ['a', 'b', 'c'].map(id => {
    const node = makeNode(id, 'builtin.wait', { x: 0, y: 0 })
    node.data.inputs = [{ id: 'flow', type: 'flow' }, { id: 'property-label', type: 'text', configKey: 'label' }]
    node.data.outputs = [{ id: 'flow', type: 'flow' }]
    node.data.promotedInputs = ['label']; node.data.config.label = 'Keep fallback'
    return { ...node, selected: id === 'b' }
  })
  useFlowStore.setState({ view: 'editor', workflowId: 'pin-fixture', workflowExecution: { mode: 'state-graph', semantics: 'blueprint' }, nodes, selectedNodeId: 'b', dirty: false, edges: [
    { id: 'first', source: 'a', sourceHandle: 'flow', target: 'b', targetHandle: 'flow' },
    { id: 'second', source: 'c', sourceHandle: 'flow', target: 'b', targetHandle: 'flow' },
    { id: 'other-direction', source: 'b', sourceHandle: 'flow', target: 'c', targetHandle: 'flow' },
  ] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root.render(<FlowApp />))
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
const ids = () => useFlowStore.getState().edges.map(edge => edge.id)
const pin = (nodeId = 'b', type = 'target', portId = 'flow') => host.querySelector<HTMLElement>(`.react-flow__handle.${type}[data-nodeid="${nodeId}"][data-handleid="${portId}"]`)!
const key = (target: EventTarget, value = 'Delete') => target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))
async function releasePin(target: Element | null = host.querySelector('.react-flow__pane'), toNode: FlowNode | null = null) {
  const origin = useFlowStore.getState().nodes.find(node => node.id === 'b')!
  await act(async () => captured.props.onConnectStart?.(new MouseEvent('mousedown'), { nodeId: 'b', handleId: 'flow', handleType: 'target' }))
  const event = new MouseEvent('mouseup', { clientX: 300, clientY: 300 })
  Object.defineProperty(event, 'target', { value: target })
  await act(async () => captured.props.onConnectEnd?.(event, { fromNode: origin, fromHandle: { id: 'flow', type: 'target' }, toNode, toHandle: null, isValid: false } as never))
}

it.each(['Delete', 'Backspace'])('disconnects the focused input with %s without deleting its selected node or same-named output', async value => {
  await act(async () => { pin().focus(); key(pin(), value) })
  expect(ids()).toEqual(['other-direction'])
  expect(useFlowStore.getState().nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
  expect(useFlowStore.getState().nodes[1]!.data.promotedInputs).toEqual(['label'])
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(1)
  await act(async () => useFlowStore.getState().undoGraph())
  expect(ids()).toEqual(['first', 'second', 'other-direction'])
})
it('allows hovered-pin Delete while preserving native editing when an inspector field has focus', async () => {
  const field = host.querySelector<HTMLInputElement>('[aria-label="Inspector value"]')!
  await act(async () => { pin().dispatchEvent(new MouseEvent('pointerover', { bubbles: true })); field.focus(); key(field) })
  expect(ids()).toHaveLength(3)
  await act(async () => { field.blur(); key(document.body) })
  expect(ids()).toEqual(['other-direction'])
})
it('offers a pin-specific right-click disconnect without removing the node', async () => {
  await act(async () => pin().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 })))
  const action = host.querySelector<HTMLButtonElement>('[role="menu"] [data-pin-disconnect]')
  expect(action?.textContent).toContain('2')
  await act(async () => action!.click())
  expect(ids()).toEqual(['other-direction'])
  expect(useFlowStore.getState().nodes).toHaveLength(3)
})
it.each(['outside', 'escape', 'close'])('disconnects captured wires in one undo when an occupied-pin blank drop is dismissed with %s', async method => {
  await releasePin()
  expect(ids()).toHaveLength(3)
  expect(host.querySelector('.node-creator')).not.toBeNull()
  await act(async () => useFlowStore.setState(state => ({ edges: [...state.edges, { id: 'later', source: 'a', sourceHandle: 'flow', target: 'b', targetHandle: 'flow' }] })))
  await act(async () => {
    if (method === 'escape') key(host.querySelector('.node-creator input')!, 'Escape')
    else host.querySelector<HTMLButtonElement>(method === 'outside' ? '.creator-scrim' : '.node-creator header button')!.click()
  })
  expect(ids()).toEqual(['other-direction', 'later'])
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(1)
  await act(async () => useFlowStore.getState().undoGraph())
  expect(ids()).toEqual(['first', 'second', 'other-direction', 'later'])
})
it('keeps existing calls when a node is chosen after an occupied-pin blank drop', async () => {
  await releasePin()
  await act(async () => host.querySelector<HTMLButtonElement>('[id="node-result-builtin.wait"] .creator-result-main')!.click())
  expect(ids()).toEqual(expect.arrayContaining(['first', 'second', 'other-direction']))
  expect(ids()).toHaveLength(4)
  expect(useFlowStore.getState().nodes).toHaveLength(4)
})
it('keeps wires after invalid node targets and drops over editor controls', async () => {
  await releasePin(pin('a'), useFlowStore.getState().nodes[0]!)
  expect(host.querySelector('.node-creator')).toBeNull()
  expect(ids()).toHaveLength(3)
  await releasePin(host.querySelector('.canvas-toolbar'))
  expect(host.querySelector('.node-creator')).toBeNull()
  expect(ids()).toHaveLength(3)
})
it('does not apply a pending disconnect to another workflow or subflow', async () => {
  await releasePin()
  await act(async () => useFlowStore.setState({ workflowId: 'another' }))
  await act(async () => host.querySelector<HTMLButtonElement>('.creator-scrim')?.click())
  expect(ids()).toHaveLength(3)
  await releasePin()
  await act(async () => useFlowStore.setState({ activeSubflowId: 'nested' }))
  await act(async () => host.querySelector<HTMLButtonElement>('.creator-scrim')?.click())
  expect(ids()).toHaveLength(3)
})
it('does not delete a connection that was rewired while the node chooser was open', async () => {
  await releasePin()
  await act(async () => useFlowStore.setState(state => ({ edges: state.edges.map(edge => edge.id === 'first' ? { ...edge, target: 'c' } : edge) })))
  await act(async () => host.querySelector<HTMLButtonElement>('.creator-scrim')!.click())
  expect(ids()).toEqual(['first', 'other-direction'])
  expect(useFlowStore.getState().edges[0]!.target).toBe('c')
})
it('keeps an empty-pin cancel clean and preserves promoted property configuration when disconnecting data', async () => {
  await act(async () => useFlowStore.setState({ edges: [] }))
  await releasePin()
  await act(async () => host.querySelector<HTMLButtonElement>('.creator-scrim')!.click())
  expect(useFlowStore.getState().dirty).toBe(false)
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(0)
  await act(async () => useFlowStore.setState({ edges: [{ id: 'property', source: 'a', sourceHandle: 'flow', target: 'b', targetHandle: 'property-label' }] }))
  await act(async () => { const target = pin('b', 'target', 'property-label'); target.focus(); key(target) })
  expect(ids()).toEqual([])
  expect(useFlowStore.getState().nodes.map(node => node.id)).toEqual(['a', 'b', 'c'])
  expect(useFlowStore.getState().nodes[1]!.data).toMatchObject({ promotedInputs: ['label'], config: { label: 'Keep fallback' } })
})
it('disconnects legacy default handles on an output without disturbing the other outputs', async () => {
  await act(async () => useFlowStore.setState({ edges: [
    { id: 'implicit', source: 'a', target: 'b' },
    { id: 'explicit', source: 'a', sourceHandle: 'flow', target: 'c', targetHandle: 'flow' },
    { id: 'other-output', source: 'b', sourceHandle: 'flow', target: 'c', targetHandle: 'flow' },
  ] }))
  await act(async () => { const target = pin('a', 'source'); target.focus(); key(target) })
  expect(ids()).toEqual(['other-output'])
  expect(useFlowStore.getState().nodes).toHaveLength(3)
})
it('consumes Delete at an unconnected pin so a selected node stays intact', async () => {
  await act(async () => useFlowStore.setState({ edges: [] }))
  await act(async () => { pin().focus(); key(pin()) })
  expect(useFlowStore.getState().nodes).toHaveLength(3)
  expect(useFlowStore.getState().dirty).toBe(false)
  expect(useFlowStore.getState().graphHistory.past).toHaveLength(0)
})

function HostedEditor() {
  const [minimized, setMinimized] = React.useState(false)
  return minimized ? <div data-minimized>RunFlow minimized</div> : <FloatingRunFlowWindow mode="maximized" closing={false} onMinimize={() => setMinimized(true)} onToggleMaximize={() => {}} onClose={() => {}} />
}
it.each(['search', 'button'])('keeps the DSH window open when Escape dismisses the node creator from its %s', async target => {
  await act(async () => root.render(<HostedEditor />))
  await releasePin()
  await act(async () => {
    const control = host.querySelector<HTMLElement>(target === 'search' ? '.node-creator input' : '.node-creator header button')!
    control.focus(); key(control, 'Escape')
  })
  expect(host.querySelector('[data-minimized]')).toBeNull()
  expect(host.querySelector('.runflow-window')).not.toBeNull()
  expect(host.querySelector('.node-creator')).toBeNull()
  expect(ids()).toEqual(['other-direction'])
  await act(async () => useFlowStore.getState().undoGraph())
  expect(ids()).toEqual(['first', 'second', 'other-direction'])
})
it('gives the pin menu Escape before the DSH window and lets a second Escape minimize the window', async () => {
  await act(async () => root.render(<HostedEditor />))
  await act(async () => pin().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
  await act(async () => key(host.querySelector('[data-pin-disconnect]')!, 'Escape'))
  expect(host.querySelector('[data-minimized]')).toBeNull()
  expect(host.querySelector('.pin-context-menu')).toBeNull()
  expect(ids()).toEqual(['first', 'second', 'other-direction'])
  await act(async () => key(host.querySelector('.runflow-window')!, 'Escape'))
  expect(host.querySelector('[data-minimized]')).not.toBeNull()
})

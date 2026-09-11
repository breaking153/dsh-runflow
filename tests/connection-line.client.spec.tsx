// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ConnectionLineType, Position, type ConnectionLineComponentProps } from '@xyflow/react'
import { CanvasConnectionLine } from '../src/client/CanvasConnectionLine.tsx'
import { makeNode, useFlowStore, type FlowNode } from '../src/client/store.ts'

it('changes occupied flow preview from invalid to valid only after opting the DAG into Blueprint', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const source = makeNode('a', 'trigger.manual', { x: 0, y: 0 })
  const target = makeNode('b', 'builtin.wait', { x: 240, y: 80 })
  const existing = makeNode('c', 'trigger.manual', { x: 0, y: 240 })
  useFlowStore.setState({ nodes: [source, target, existing], workflowExecution: { mode: 'dag' }, edges: [{ id: 'existing', source: 'c', sourceHandle: 'output', target: 'b', targetHandle: 'flow' }] })
  const props = { fromNode: source, toNode: target, fromHandle: { id: 'output', type: 'source' }, toHandle: { id: 'flow', type: 'target' }, fromX: 100, fromY: 50, toX: 240, toY: 80, fromPosition: Position.Right, toPosition: Position.Left, connectionLineType: ConnectionLineType.Bezier, connectionStatus: null, pointer: { x: 240, y: 80 } } as ConnectionLineComponentProps<FlowNode>
  const feedback = vi.fn(); const host = document.createElement('div'); const root = createRoot(host)
  try {
    await act(async () => root.render(<svg><CanvasConnectionLine {...props} onFeedback={feedback} /></svg>))
    expect(host.querySelector('.is-invalid')).not.toBeNull()
    expect(feedback).toHaveBeenLastCalledWith(expect.objectContaining({ ok: false, reason: 'input-occupied' }))
    await act(async () => useFlowStore.setState({ workflowExecution: { mode: 'dag', semantics: 'blueprint' } }))
    expect(host.querySelector('.is-valid')).not.toBeNull()
    expect(feedback).toHaveBeenLastCalledWith(expect.objectContaining({ ok: true }))
  } finally { act(() => root.unmount()) }
})

it('renders an invalid temporary wire without SVG fill and reports the mismatch before release', async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const source = makeNode('source', 'builtin.noop', { x: 0, y: 0 })
  const target = makeNode('target', 'builtin.noop', { x: 240, y: 80 })
  source.data.outputs = [{ id: 'number', type: 'number' }]; target.data.inputs = [{ id: 'text', type: 'text' }]
  useFlowStore.setState({ nodes: [source, target], edges: [] })
  const props = { fromNode: source, toNode: target, fromHandle: { id: 'number', type: 'source' }, toHandle: { id: 'text', type: 'target' }, fromX: 100, fromY: 50, toX: 240, toY: 80, fromPosition: Position.Right, toPosition: Position.Left, connectionLineType: ConnectionLineType.Bezier, connectionStatus: 'invalid', pointer: { x: 240, y: 80 } } as ConnectionLineComponentProps<FlowNode>
  const feedback = vi.fn(); const host = document.createElement('div'); const root = createRoot(host)
  try {
    await act(async () => root.render(<svg><CanvasConnectionLine {...props} onFeedback={feedback} /></svg>))
    expect(host.querySelector('path')?.getAttribute('fill')).toBe('none')
    expect(host.querySelector('path')?.getAttribute('stroke')).toBe('#f06a75')
    expect(feedback).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: 'type-mismatch' }))
  } finally { act(() => root.unmount()) }
})

it('diagnoses reverse drags by handle direction when input and output share their name', async () => {
  const source = makeNode('a', 'builtin.noop', { x: 0, y: 0 })
  const target = makeNode('b', 'builtin.noop', { x: 240, y: 80 })
  const existing = makeNode('c', 'builtin.noop', { x: 0, y: 240 })
  for (const node of [source, target, existing]) {
    node.data.inputs = [{ id: 'value', type: 'number' }]
    node.data.outputs = [{ id: 'value', type: 'number' }]
  }
  useFlowStore.setState({ nodes: [source, target, existing], workflowExecution: { mode: 'state-graph', semantics: 'blueprint' }, edges: [{ id: 'existing', source: 'c', sourceHandle: 'value', target: 'b', targetHandle: 'value' }] })
  const props = { fromNode: target, toNode: source, fromHandle: { id: 'value', type: 'target' }, toHandle: { id: 'value', type: 'source' }, fromX: 240, fromY: 80, toX: 100, toY: 50, fromPosition: Position.Left, toPosition: Position.Right, connectionLineType: ConnectionLineType.Bezier, connectionStatus: 'invalid', pointer: { x: 100, y: 50 } } as ConnectionLineComponentProps<FlowNode>
  const feedback = vi.fn(); const host = document.createElement('div'); const root = createRoot(host)
  try {
    await act(async () => root.render(<svg><CanvasConnectionLine {...props} onFeedback={feedback} /></svg>))
    expect(host.querySelector('path')?.getAttribute('stroke')).toBe('#f06a75')
    expect(feedback).toHaveBeenCalledWith(expect.objectContaining({ ok: false, reason: 'input-occupied' }))
  } finally { act(() => root.unmount()) }
})

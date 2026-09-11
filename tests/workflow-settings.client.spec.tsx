// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorHeader } from '../src/client/App.tsx'
import { makeEdge, makeNode, useFlowStore } from '../src/client/store.ts'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ workflowExecution: { mode: 'state-graph', maxSteps: 100 }, nodes: [makeNode('start', 'trigger.manual', { x: 0, y: 0 }), makeNode('action', 'builtin.noop', { x: 200, y: 0 })], edges: [] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
async function openSettings() {
  await act(async () => root.render(<EditorHeader onTemplates={() => undefined} onKeybindings={() => undefined} />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Run settings"]')!.click())
}
function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('workflow execution settings', () => {
  it('keeps saved graphs in legacy semantics until explicitly switched, then removes the flag when switched back', async () => {
    await openSettings()
    const semantics = host.querySelector<HTMLSelectElement>('select[aria-label="Execution semantics"]')
    expect(semantics).not.toBeNull()
    expect(semantics!.value).toBe('legacy')
    expect(useFlowStore.getState().definition().execution?.semantics).toBeUndefined()
    await act(async () => { semantics!.value = 'blueprint'; semantics!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(useFlowStore.getState().definition().execution).toMatchObject({ mode: 'state-graph', semantics: 'blueprint', maxSteps: 100 })
    expect(host.textContent).toContain('Data wires supply values')
    await act(async () => { semantics!.value = 'legacy'; semantics!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(useFlowStore.getState().definition().execution).toEqual({ mode: 'state-graph', maxSteps: 100 })
  })

  it('creates blank workflows using Blueprint without converting an existing definition', () => {
    const before = useFlowStore.getState().definition()
    useFlowStore.getState().createWorkflow()
    expect(useFlowStore.getState().definition().execution).toEqual({ mode: 'state-graph', semantics: 'blueprint', maxSteps: 100 })
    expect(before.execution?.semantics).toBeUndefined()
  })

  it('edits state graph limits and entry nodes from the workflow settings', async () => {
    await openSettings()
    const limit = host.querySelector<HTMLInputElement>('input[aria-label="Maximum steps"]')!
    expect(limit).not.toBeNull()
    await act(async () => changeValue(limit, '24'))
    const entry = host.querySelector<HTMLInputElement>('input[aria-label="Entry: Manual Trigger"]')!
    await act(async () => entry.click())
    expect(useFlowStore.getState().definition().execution).toMatchObject({ mode: 'state-graph', maxSteps: 24, entryNodeIds: ['start'] })
  })

  it('keeps invalid state JSON out of the saved workflow and exposes a correction', async () => {
    await openSettings()
    const initial = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Initial state · JSON object"]')!
    expect(initial).not.toBeNull()
    await act(async () => changeValue(initial, '{ invalid'))
    await act(async () => initial.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('JSON')
    expect(useFlowStore.getState().definition().execution?.initialState).toBeUndefined()
  })

  it('does not switch a graph containing a cycle into DAG mode', async () => {
    useFlowStore.setState({ edges: [makeEdge('action', 'action', 'loop', 'flow', 'flow')] })
    await openSettings()
    const mode = host.querySelector<HTMLSelectElement>('select[aria-label="Execution mode"]')!
    expect(mode).not.toBeNull()
    await act(async () => { mode.value = 'dag'; mode.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(useFlowStore.getState().definition().execution?.mode).toBe('state-graph')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('cycle')
  })
})

// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PropertyInspector } from '../src/client/Panels.tsx'
import { makeNode, useFlowStore } from '../src/client/store.ts'
import { descriptorFor } from '../src/client/catalog.tsx'
let host: HTMLDivElement; let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers(); useFlowStore.setState(useFlowStore.getInitialState(), true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers() })
it('provides stable routing ports and all-input joins in the offline authoring catalog', () => {
  expect(descriptorFor('control.branch').outputs?.map(port => port.id)).toEqual(['true', 'false'])
  expect(descriptorFor('control.switch').outputs?.map(port => port.id)).toEqual(['case1', 'case2', 'case3', 'case4', 'default'])
  expect(descriptorFor('control.join').activation).toBe('all')
  expect(descriptorFor('trigger.agent').inputs).toEqual([])
})
it('edits a comparison as JSON so boolean values remain booleans', async () => {
  useFlowStore.setState({ selectedNodeId: 'branch', nodes: [makeNode('branch', 'control.branch', { x: 0, y: 0 })] })
  await act(async () => root.render(<PropertyInspector />))
  const input = host.querySelector<HTMLTextAreaElement>('[aria-label="Compare value · JSON"]')!
  expect(input).not.toBeNull()
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'true'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  expect(useFlowStore.getState().definition().nodes[0]?.config['value']).toBe(true)
})
it('removes the predicate when switching a loop back to iteration-limit-only', async () => {
  useFlowStore.setState({ selectedNodeId: 'loop', nodes: [makeNode('loop', 'control.loop', { x: 0, y: 0 }, { path: 'count', operator: 'lessThan', value: 5, maxIterations: 10 })] })
  await act(async () => root.render(<PropertyInspector />))
  const operator = host.querySelector<HTMLSelectElement>('[aria-label="Condition"]')!
  await act(async () => { operator.value = ''; operator.dispatchEvent(new Event('change', { bubbles: true })) })
  const config = useFlowStore.getState().definition().nodes[0]!.config
  expect(config['operator']).toBeUndefined()
  expect(config['path']).toBeUndefined()
  expect(config['maxIterations']).toBe(10)
})

// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LightCodeEditor, completionsFor } from '../src/client/LightCodeEditor.tsx'
import { NodePalette } from '../src/client/Panels.tsx'
import { SourceWorkbench } from '../src/client/SourceWorkbench.tsx'
import { mergeNodeCatalog } from '../src/client/catalog.tsx'
import { useFlowStore } from '../src/client/store.ts'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0) as unknown as number
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useFlowStore.setState({ sourceWorkbenchOpen: false })
})

describe('RunFlow interactive UI components', () => {
  it('offers ctx-aware completion and inserts the selected item from the keyboard', async () => {
    expect(completionsFor('cordis-node', 'ctx.flowS')).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'ctx.flowScript.run' }),
    ]))
    function Fixture() {
      const [value, setValue] = React.useState('ctx.flowS')
      return <LightCodeEditor profile="cordis-node" value={value} onChange={setValue} />
    }
    await act(async () => root.render(<Fixture />))
    const textarea = host.querySelector('textarea')!
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 's' })))
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, code: 'Space' })))
    expect(host.querySelector('[role="listbox"]')).not.toBeNull()
    await act(async () => textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })))
    expect(textarea.value.startsWith('ctx.flowScript.')).toBe(true)
  })

  it('filters the live Host catalog and adds a custom node from the library', async () => {
    const initial = useFlowStore.getState().nodes.length
    useFlowStore.setState({
      nodeCatalog: mergeNodeCatalog([{
        type: 'fixture.ui-node', title: 'UI Context Node', description: 'ctx test', category: 'action',
        color: '#2563eb', icon: 'braces', inputs: [], outputs: [{ id: 'output', type: 'json' }],
      }]),
    })
    await act(async () => root.render(<NodePalette />))
    const search = host.querySelector<HTMLInputElement>('input[aria-label="搜索节点"]')!
    await act(async () => {
      search.value = 'UI Context'
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const add = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('UI Context Node'))!
    await act(async () => add.click())
    expect(useFlowStore.getState().nodes).toHaveLength(initial + 1)
    expect(useFlowStore.getState().nodes.at(-1)?.data.nodeType).toBe('fixture.ui-node')
  })

  it('keeps trusted source editing locked outside creation mode and closes with Escape', async () => {
    useFlowStore.setState({
      sourceWorkbenchOpen: true,
      capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false },
      subagentProviders: [],
    })
    await act(async () => root.render(<SourceWorkbench />))
    expect(host.textContent).toContain('仅创造模式可编辑可信 Host 源码')
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(useFlowStore.getState().sourceWorkbenchOpen).toBe(false)
  })
})

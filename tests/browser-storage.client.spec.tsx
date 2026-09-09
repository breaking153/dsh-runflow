// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkflowSidebar } from '../src/client/WorkflowSidebar.tsx'
import { useResizablePanel } from '../src/client/use-resizable-panel.ts'
import { favoriteNodeTypes, rememberNodeType, toggleFavoriteNodeType } from '../src/client/node-search.ts'
import { editorCommandDefinitions, resetEditorKeybindings, setEditorKeybinding } from '../src/client/editor-commands.ts'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  resetEditorKeybindings()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  resetEditorKeybindings()
})

function ResizeFixture() {
  const panel = useResizablePanel({ storageKey: 'test-panel', defaultSize: 360, minSize: 280, maxSize: 680, resizeFrom: 'start', label: 'Resize inspector' })
  return <section><span {...panel.separatorProps} /><output>{panel.size}</output></section>
}

describe('optional browser preferences', () => {
  it('mounts and resizes the inspector when access to localStorage is denied', async () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    await act(async () => root.render(<ResizeFixture />))
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' })))
    expect(host.querySelector('output')?.textContent).toBe('376')
  })

  it('keeps sidebar navigation available when preference writes exceed the browser quota', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    await act(async () => root.render(<WorkflowSidebar />))
    const nodesTab = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Nodes'))!
    await act(async () => nodesTab.click())
    expect(host.textContent).toContain('Node Library')
  })

  it('keeps node insertion and favorite actions usable when preference storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    expect(() => rememberNodeType('dsh.agent')).not.toThrow()
    expect(toggleFavoriteNodeType('dsh.agent')).toEqual(['dsh.agent'])
    expect(favoriteNodeTypes()).toEqual([])
  })

  it('applies and resets keyboard preferences in memory when the browser cannot write them', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(() => setEditorKeybinding('workflow.save', 'Ctrl Shift S')).not.toThrow()
    expect(editorCommandDefinitions().find(command => command.id === 'workflow.save')?.shortcut).toBe('Ctrl Shift S')
    expect(() => resetEditorKeybindings()).not.toThrow()
    expect(editorCommandDefinitions().find(command => command.id === 'workflow.save')?.shortcut).toBe('Ctrl S')
  })
})

// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorHeader } from '../src/client/App.tsx'
import { useFlowStore } from '../src/client/store.ts'

const runtime = vi.hoisted(() => ({ connected: false, sessionId: undefined as string | undefined }))
vi.mock('../src/client/runtime.ts', async importOriginal => ({
  ...await importOriginal<typeof import('../src/client/runtime.ts')>(),
  useFlowRuntime: () => runtime,
}))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  runtime.connected = false
  runtime.sessionId = undefined
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ dirty: false, savedAt: undefined, saveError: undefined })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
async function renderHeader() {
  await act(async () => root.render(<EditorHeader onTemplates={() => undefined} onKeybindings={() => undefined} />))
  return host.querySelector<HTMLElement>('.autosave-state')!
}

describe('editor save feedback', () => {
  it('identifies a never-saved workflow without a saved indicator', async () => {
    const state = await renderHeader()
    expect(state.textContent).toBe('Not saved')
    expect(state.classList.contains('saved')).toBe(false)
    expect(state.querySelector('span')).toBeNull()
  })

  it('identifies an offline browser draft as local instead of Host-saved', async () => {
    useFlowStore.setState({ savedAt: '2026-09-09T00:00:00.000Z' })
    const state = await renderHeader()
    expect(state.textContent).toContain('Local draft')
    expect(state.classList.contains('saved')).toBe(false)
  })

  it('shows the actual save failure as an accessible alert', async () => {
    useFlowStore.setState({ dirty: true, saveError: 'Host disk is full' })
    const state = await renderHeader()
    expect(state.getAttribute('role')).toBe('alert')
    expect(state.textContent).toContain('Host disk is full')
    expect(state.getAttribute('title')).toBe('Host disk is full')
  })

  it('shows pending changes as saving even when an older version has a timestamp', async () => {
    runtime.connected = true
    runtime.sessionId = 'main-session'
    useFlowStore.setState({ dirty: true, savedAt: '2026-09-09T00:00:00.000Z' })
    const state = await renderHeader()
    expect(state.textContent).toBe('Saving…')
    expect(state.classList.contains('saved')).toBe(false)
  })

  it('keeps action names available when responsive styles hide the text spans', async () => {
    await renderHeader()
    for (const name of ['Export', 'Templates', 'Keys', 'Run settings', 'Execute workflow']) {
      expect(host.querySelector(`button[aria-label="${name}"]`)).not.toBeNull()
    }
  })
})

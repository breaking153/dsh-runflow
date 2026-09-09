// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../src/client/EditorOverlays.tsx'
import { KeybindingSettings } from '../src/client/KeybindingSettings.tsx'
import { TemplateBrowser } from '../src/client/TemplateBrowser.tsx'
import { useFlowStore } from '../src/client/store.ts'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  vi.restoreAllMocks()
  host.remove()
})

type DialogKind = 'commands' | 'templates' | 'keybindings'

function Fixture({ kind }: { kind: DialogKind }) {
  const [open, setOpen] = React.useState(false)
  const close = () => setOpen(false)
  return <>
    <button data-trigger onClick={() => setOpen(true)}>Open dialog</button>
    <button data-outside>Outside control</button>
    {kind === 'commands' && <CommandPalette open={open} onClose={close} onCommand={() => {}} />}
    {kind === 'templates' && <TemplateBrowser open={open} onClose={close} />}
    {kind === 'keybindings' && <KeybindingSettings open={open} onClose={close} />}
  </>
}

async function openDialog(kind: DialogKind) {
  await act(async () => root.render(<Fixture kind={kind} />))
  const trigger = host.querySelector<HTMLButtonElement>('[data-trigger]')!
  trigger.focus()
  await act(async () => trigger.click())
  return { trigger, dialog: host.querySelector<HTMLElement>('[role="dialog"]')! }
}

function press(target: HTMLElement, key: string, shiftKey = false) {
  return target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey }))
}

describe('editor dialog keyboard accessibility', () => {
  it.each<DialogKind>(['commands', 'templates', 'keybindings'])('%s contains keyboard focus and restores its trigger', async kind => {
    const { trigger, dialog } = await openDialog(kind)
    expect(dialog.contains(document.activeElement)).toBe(true)
    const controls = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input')]
    const first = controls[0]!
    const last = controls.at(-1)!
    last.focus()
    await act(async () => { press(last, 'Tab') })
    expect(document.activeElement).toBe(first)
    await act(async () => { press(first, 'Tab', true) })
    expect(document.activeElement).toBe(last)
    await act(async () => host.querySelector<HTMLElement>('[data-outside]')!.focus())
    expect(dialog.contains(document.activeElement)).toBe(true)
    await act(async () => { press(document.activeElement as HTMLElement, 'Escape') })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('cancels shortcut recording before dismissing the dialog', async () => {
    const { dialog } = await openDialog('keybindings')
    const record = dialog.querySelector<HTMLButtonElement>('.keybindings-list button')!
    await act(async () => record.click())
    expect(record.classList.contains('recording')).toBe(true)
    await act(async () => { press(record, 'Escape') })
    expect(record.classList.contains('recording')).toBe(false)
    expect(host.querySelector('[role="dialog"]')).toBe(dialog)
    await act(async () => { press(record, 'Escape') })
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('exposes command search and the keyboard-selected result to assistive technology', async () => {
    const { dialog } = await openDialog('commands')
    const search = dialog.querySelector<HTMLInputElement>('[role="combobox"]')!
    expect(search).not.toBeNull()
    expect(search.getAttribute('aria-label')).toBeTruthy()
    expect(search.getAttribute('aria-expanded')).toBe('true')
    const firstId = search.getAttribute('aria-activedescendant')
    await act(async () => { press(search, 'ArrowDown') })
    const selectedId = search.getAttribute('aria-activedescendant')
    expect(selectedId).not.toBe(firstId)
    expect(document.getElementById(selectedId!)?.getAttribute('aria-selected')).toBe('true')
  })

  it('does not subscribe the closed template browser to graph changes', async () => {
    let commits = 0
    await act(async () => root.render(<React.Profiler id="templates" onRender={() => { commits += 1 }}>
      <TemplateBrowser open={false} onClose={() => {}} />
    </React.Profiler>))
    const before = commits
    await act(async () => useFlowStore.setState(state => ({ nodes: [...state.nodes] })))
    expect(commits).toBe(before)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('reports failed template storage without presenting an unsaved template as saved', async () => {
    useFlowStore.setState(state => ({ nodes: state.nodes.map((node, index) => ({ ...node, selected: index === 0 })) }))
    const { dialog } = await openDialog('templates')
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Save selection'))!
    expect(save.disabled).toBe(false)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage full', 'QuotaExceededError') })
    await act(async () => save.click())
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('could not be saved')
    expect(dialog.querySelector('.template-grid article')).toBeNull()
    expect(host.querySelector('[role="dialog"]')).toBe(dialog)
  })
})

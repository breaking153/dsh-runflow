// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clampPanelSize,
  nextPanelSize,
  useResizablePanel,
} from '../src/client/use-resizable-panel.ts'

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
  host.remove()
})

function Fixture() {
  const panel = useResizablePanel({
    storageKey: 'runflow:test-panel',
    defaultSize: 360,
    minSize: 280,
    maxSize: 680,
    keyboardStep: 16,
    resizeFrom: 'start',
    label: 'Resize inspector',
  })
  return <section style={{ width: panel.size }}><span {...panel.separatorProps} /><output>{panel.size}</output></section>
}

describe('RunFlow resizable workspace shell', () => {
  it('clamps pointer geometry at both panel bounds', () => {
    expect(clampPanelSize(120, 280, 680)).toBe(280)
    expect(clampPanelSize(900, 280, 680)).toBe(680)
    expect(nextPanelSize({ startSize: 360, startClient: 800, currentClient: 720, resizeFrom: 'start', minSize: 280, maxSize: 680 })).toBe(440)
    expect(nextPanelSize({ startSize: 360, startClient: 800, currentClient: 900, resizeFrom: 'start', minSize: 280, maxSize: 680 })).toBe(280)
  })

  it('exposes an adjustable separator and supports arrow-key resizing', async () => {
    await act(async () => root.render(<Fixture />))
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')
    expect(separator.getAttribute('aria-valuemin')).toBe('280')
    expect(separator.getAttribute('aria-valuemax')).toBe('680')
    expect(separator.getAttribute('aria-valuenow')).toBe('360')

    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' })))
    expect(host.querySelector('output')?.textContent).toBe('376')
    expect(localStorage.getItem('runflow:test-panel')).toBe('376')
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' })))
    expect(host.querySelector('output')?.textContent).toBe('280')
    await act(async () => separator.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' })))
    expect(host.querySelector('output')?.textContent).toBe('680')
  })

  it('keeps keyboard control available after beginning a pointer resize', async () => {
    await act(async () => root.render(<Fixture />))
    const separator = host.querySelector<HTMLElement>('[role="separator"]')!

    await act(async () => separator.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
      clientX: 800,
    })))

    expect(document.activeElement).toBe(separator)
  })
})

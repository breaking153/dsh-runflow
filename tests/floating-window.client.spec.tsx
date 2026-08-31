// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/client/App.tsx', () => ({
  FlowApp: () => <div data-testid="flow-app">RunFlow canvas</div>,
}))

import { FloatingRunFlowWindow, RunFlowDock } from '../src/client/FloatingRunFlowWindow.tsx'

class FixturePointerEvent extends MouseEvent {
  readonly pointerId: number

  constructor(type: string, init: MouseEventInit & { pointerId?: number } = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, 'PointerEvent', { configurable: true, value: FixturePointerEvent })
  localStorage.clear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RunFlow floating window controls', () => {
  it('moves by pointer, exposes resize handles, and supports maximize, minimize, and close', async () => {
    const onMinimize = vi.fn()
    const onToggleMaximize = vi.fn()
    const onClose = vi.fn()
    await act(async () => root.render(<FloatingRunFlowWindow
      mode="floating"
      closing={false}
      onMinimize={onMinimize}
      onToggleMaximize={onToggleMaximize}
      onClose={onClose}
    />))

    const dialog = host.querySelector<HTMLElement>('[role="dialog"]')!
    const header = host.querySelector<HTMLElement>('.runflow-window-bar')!
    const initialLeft = Number.parseFloat(dialog.style.left)
    const initialTop = Number.parseFloat(dialog.style.top)
    await act(async () => {
      header.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 40, clientY: 30, pointerId: 7 }))
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 80, clientY: 55, pointerId: 7 }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 80, clientY: 55, pointerId: 7 }))
    })
    expect(Number.parseFloat(dialog.style.left)).toBeGreaterThan(initialLeft)
    expect(Number.parseFloat(dialog.style.top)).toBeGreaterThan(initialTop)
    expect(host.querySelectorAll('.runflow-resize-handle')).toHaveLength(8)

    await act(async () => header.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(onToggleMaximize).toHaveBeenCalledOnce()
    await act(async () => dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
    expect(onMinimize).toHaveBeenCalledOnce()
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="关闭 RunFlow"]')!.click())
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('restores and closes the minimized dock with distinct controls', async () => {
    const onRestore = vi.fn()
    const onClose = vi.fn()
    await act(async () => root.render(<RunFlowDock
      workflowCount={4}
      closing={false}
      onRestore={onRestore}
      onClose={onClose}
    />))
    expect(host.textContent).toContain('4 个工作流')
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="恢复 RunFlow 浮动工作台"]')!.click())
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="关闭已最小化的 RunFlow"]')!.click())
    expect(onRestore).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})

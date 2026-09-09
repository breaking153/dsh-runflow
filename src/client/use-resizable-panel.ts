import { useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type PointerEvent as ReactPointerEvent } from 'react'
import { readBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'

export type PanelResizeEdge = 'start' | 'end'

export interface PanelResizeCalculation {
  startSize: number
  startClient: number
  currentClient: number
  resizeFrom: PanelResizeEdge
  minSize: number
  maxSize: number
}

export function clampPanelSize(size: number, minSize: number, maxSize: number): number {
  return Math.min(maxSize, Math.max(minSize, size))
}

export function nextPanelSize(input: PanelResizeCalculation): number {
  const delta = input.currentClient - input.startClient
  const next = input.resizeFrom === 'start'
    ? input.startSize - delta
    : input.startSize + delta
  return clampPanelSize(next, input.minSize, input.maxSize)
}

export interface UseResizablePanelOptions {
  storageKey: string
  defaultSize: number
  minSize: number
  maxSize: number
  keyboardStep?: number
  resizeFrom: PanelResizeEdge
  label: string
}

export interface ResizablePanel {
  size: number
  setSize(size: number): void
  separatorProps: HTMLAttributes<HTMLElement> & {
    role: 'separator'
    tabIndex: 0
    'aria-orientation': 'vertical'
    'aria-label': string
    'aria-valuemin': number
    'aria-valuemax': number
    'aria-valuenow': number
    onPointerDown(event: ReactPointerEvent<HTMLElement>): void
  }
}

export function useResizablePanel(options: UseResizablePanelOptions): ResizablePanel {
  const { storageKey, defaultSize, minSize, maxSize, resizeFrom, label } = options
  const keyboardStep = options.keyboardStep ?? 16
  const [size, setRawSize] = useState(() => {
    const storedSource = readBrowserStorage(storageKey)
    const stored = storedSource === null ? Number.NaN : Number(storedSource)
    return clampPanelSize(Number.isFinite(stored) ? stored : defaultSize, minSize, maxSize)
  })
  const cleanupRef = useRef<() => void>()
  const persist = useCallback((next: number): void => {
    const clamped = clampPanelSize(next, minSize, maxSize)
    setRawSize(clamped)
    writeBrowserStorage(storageKey, String(Math.round(clamped)))
  }, [maxSize, minSize, storageKey])

  useEffect(() => () => cleanupRef.current?.(), [])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0) return
    event.currentTarget.focus()
    event.preventDefault()
    cleanupRef.current?.()
    const startClient = event.clientX
    const startSize = size
    const pointerId = event.pointerId
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      setRawSize(nextPanelSize({ startSize, startClient, currentClient: next.clientX, resizeFrom, minSize, maxSize }))
    }
    const cleanup = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.userSelect = previousUserSelect
      cleanupRef.current = undefined
    }
    const stop = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      const finalSize = nextPanelSize({ startSize, startClient, currentClient: next.clientX, resizeFrom, minSize, maxSize })
      cleanup()
      persist(finalSize)
    }
    cleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [maxSize, minSize, persist, resizeFrom, size])

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>): void => {
    let next: number | undefined
    if (event.key === 'Home') next = minSize
    if (event.key === 'End') next = maxSize
    if (event.key === 'ArrowLeft') next = size + (resizeFrom === 'start' ? keyboardStep : -keyboardStep)
    if (event.key === 'ArrowRight') next = size + (resizeFrom === 'start' ? -keyboardStep : keyboardStep)
    if (next === undefined) return
    event.preventDefault()
    persist(next)
  }, [keyboardStep, maxSize, minSize, persist, resizeFrom, size])

  const separatorProps = useMemo(() => ({
    role: 'separator' as const,
    tabIndex: 0 as const,
    'aria-orientation': 'vertical' as const,
    'aria-label': label,
    'aria-valuemin': minSize,
    'aria-valuemax': maxSize,
    'aria-valuenow': Math.round(size),
    onPointerDown,
    onKeyDown,
  }), [label, maxSize, minSize, onKeyDown, onPointerDown, size])

  return { size, setSize: persist, separatorProps }
}

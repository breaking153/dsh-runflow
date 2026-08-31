import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Grip, Maximize2, MessageSquare, Minimize2, Workflow, X } from 'lucide-react'
import { FlowApp } from './App.tsx'

export type RunFlowWindowMode = 'floating' | 'maximized'

export interface RunFlowWindowGeometry {
  x: number
  y: number
  width: number
  height: number
}

type ResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

const GEOMETRY_KEY = 'dsh-runflow:window-geometry'
const EDGE_GAP = 8
const MIN_WIDTH = 680
const MIN_HEIGHT = 440

function defaultGeometry(): RunFlowWindowGeometry {
  const viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight
  if (viewportWidth <= 720) return { x: 6, y: 6, width: viewportWidth - 12, height: viewportHeight - 12 }
  const width = Math.min(1160, Math.max(MIN_WIDTH, viewportWidth - 300))
  const height = Math.max(MIN_HEIGHT, viewportHeight - 32)
  return { x: viewportWidth - width - 16, y: 16, width, height }
}

function clampGeometry(input: RunFlowWindowGeometry): RunFlowWindowGeometry {
  if (typeof window === 'undefined') return input
  const maxWidth = Math.max(320, window.innerWidth - EDGE_GAP * 2)
  const maxHeight = Math.max(320, window.innerHeight - EDGE_GAP * 2)
  const width = Math.min(maxWidth, Math.max(Math.min(MIN_WIDTH, maxWidth), input.width))
  const height = Math.min(maxHeight, Math.max(Math.min(MIN_HEIGHT, maxHeight), input.height))
  return {
    x: Math.min(window.innerWidth - width - EDGE_GAP, Math.max(EDGE_GAP, input.x)),
    y: Math.min(window.innerHeight - height - EDGE_GAP, Math.max(EDGE_GAP, input.y)),
    width,
    height,
  }
}

function restoredGeometry(): RunFlowWindowGeometry {
  if (typeof localStorage === 'undefined') return defaultGeometry()
  try {
    const value = JSON.parse(localStorage.getItem(GEOMETRY_KEY) ?? 'null') as Partial<RunFlowWindowGeometry> | null
    if (value !== null && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key as keyof RunFlowWindowGeometry]))) {
      return clampGeometry(value as RunFlowWindowGeometry)
    }
  } catch {}
  return clampGeometry(defaultGeometry())
}

function resizedGeometry(base: RunFlowWindowGeometry, direction: ResizeDirection, dx: number, dy: number): RunFlowWindowGeometry {
  let left = base.x
  let top = base.y
  let right = base.x + base.width
  let bottom = base.y + base.height
  if (direction.includes('w')) left += dx
  if (direction.includes('e')) right += dx
  if (direction.includes('n')) top += dy
  if (direction.includes('s')) bottom += dy
  const minWidth = Math.min(MIN_WIDTH, window.innerWidth - EDGE_GAP * 2)
  const minHeight = Math.min(MIN_HEIGHT, window.innerHeight - EDGE_GAP * 2)
  if (right - left < minWidth) {
    if (direction.includes('w')) left = right - minWidth
    else right = left + minWidth
  }
  if (bottom - top < minHeight) {
    if (direction.includes('n')) top = bottom - minHeight
    else bottom = top + minHeight
  }
  if (left < EDGE_GAP) left = EDGE_GAP
  if (top < EDGE_GAP) top = EDGE_GAP
  if (right > window.innerWidth - EDGE_GAP) right = window.innerWidth - EDGE_GAP
  if (bottom > window.innerHeight - EDGE_GAP) bottom = window.innerHeight - EDGE_GAP
  return clampGeometry({ x: left, y: top, width: right - left, height: bottom - top })
}

interface FloatingRunFlowWindowProps {
  mode: RunFlowWindowMode
  closing: boolean
  onMinimize(): void
  onToggleMaximize(): void
  onClose(): void
}

export function FloatingRunFlowWindow({ mode, closing, onMinimize, onToggleMaximize, onClose }: FloatingRunFlowWindowProps) {
  const windowRef = useRef<HTMLElement>(null)
  const [geometry, setGeometry] = useState(restoredGeometry)
  const [interacting, setInteracting] = useState(false)

  const commitGeometry = useCallback((next: RunFlowWindowGeometry): void => {
    const bounded = clampGeometry(next)
    setGeometry(bounded)
    localStorage.setItem(GEOMETRY_KEY, JSON.stringify(bounded))
  }, [])

  useEffect(() => windowRef.current?.focus(), [])
  useEffect(() => {
    const onResize = (): void => commitGeometry(geometry)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [commitGeometry, geometry])

  const trackPointer = useCallback((event: ReactPointerEvent, update: (dx: number, dy: number) => void): void => {
    if (event.button !== 0 || mode !== 'floating') return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    setInteracting(true)
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      update(next.clientX - startX, next.clientY - startY)
    }
    const stop = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
      document.body.style.userSelect = previousUserSelect
      window.getSelection()?.removeAllRanges()
      setInteracting(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
  }, [mode])

  const beginDrag = (event: ReactPointerEvent<HTMLElement>): void => {
    if ((event.target as HTMLElement).closest('button')) return
    const base = geometry
    trackPointer(event, (dx, dy) => commitGeometry({ ...base, x: base.x + dx, y: base.y + dy }))
  }

  const beginResize = (direction: ResizeDirection, event: ReactPointerEvent<HTMLSpanElement>): void => {
    event.stopPropagation()
    const base = geometry
    trackPointer(event, (dx, dy) => commitGeometry(resizedGeometry(base, direction, dx, dy)))
  }

  const style = mode === 'floating' ? {
    left: geometry.x,
    top: geometry.y,
    width: geometry.width,
    height: geometry.height,
  } satisfies CSSProperties : undefined

  return <section
    ref={windowRef}
    data-runflow-surface
    className={'flow-overlay runflow-window mode-' + mode + (closing ? ' is-closing' : '') + (interacting ? ' is-interacting' : '')}
    style={style}
    role="dialog"
    aria-modal="false"
    aria-label="DSH RunFlow 浮动工作台"
    tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onMinimize()
      }
    }}
  >
    <header className="runflow-window-bar" onPointerDown={beginDrag} onDoubleClick={event => {
      if ((event.target as HTMLElement).closest('button') === null) onToggleMaximize()
    }}>
      <span className="runflow-window-mark"><Workflow size={16} /></span>
      <span className="runflow-window-title"><strong>RunFlow</strong><small>{mode === 'maximized' ? '专注模式' : '拖拽标题栏移动 · 拖拽边缘缩放 · DSH 会话仍可操作'}</small></span>
      <span className="runflow-window-actions">
        <button className="runflow-session-switch" onClick={onMinimize} aria-label="返回 DSH 会话并最小化 RunFlow" title="返回 DSH 会话（Esc）"><MessageSquare size={14} /><span>返回会话</span></button>
        <button onClick={onToggleMaximize} aria-label={mode === 'maximized' ? '还原 RunFlow 浮动窗口' : '最大化 RunFlow'} title={mode === 'maximized' ? '还原浮动窗口' : '最大化'}>{mode === 'maximized' ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>
        <button onClick={onClose} aria-label="关闭 RunFlow" title="关闭 RunFlow"><X size={16} /></button>
      </span>
    </header>
    <div className="runflow-window-body"><FlowApp onClose={onClose} /></div>
    {mode === 'floating' && <>
      {(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).map(direction => <span
        key={direction}
        className={'runflow-resize-handle handle-' + direction}
        onPointerDown={event => beginResize(direction, event)}
        aria-hidden="true"
      />)}
      <span className="runflow-resize-grip" aria-hidden="true"><Grip size={13} /></span>
    </>}
  </section>
}

interface RunFlowDockProps {
  workflowCount: number
  closing: boolean
  onRestore(): void
  onClose(): void
}

export function RunFlowDock({ workflowCount, closing, onRestore, onClose }: RunFlowDockProps) {
  return <aside data-runflow-surface className={'runflow-window-dock' + (closing ? ' is-closing' : '')} aria-label="已最小化的 RunFlow">
    <button className="runflow-dock-restore" onClick={onRestore} autoFocus aria-label="恢复 RunFlow 浮动工作台">
      <span className="runflow-dock-mark"><Workflow size={16} /></span>
      <span><strong>RunFlow</strong><small>已最小化 · {workflowCount} 个工作流</small></span>
    </button>
    <button className="runflow-dock-close" onClick={onClose} aria-label="关闭已最小化的 RunFlow" title="关闭"><X size={14} /></button>
  </aside>
}

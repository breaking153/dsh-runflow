/** Browser half: a sidebar launcher opening a movable RunFlow workspace. */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Activity, CircleCheckBig, CircleDashed, CircleX, Clock3, LoaderCircle } from 'lucide-react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { connectFlowModelCatalog } from './model-catalog.ts'
import { RunFlowMark } from './RunFlowLogo.tsx'
import { connectFlowRuntime, useFlowRuntime } from './runtime.ts'
import { FloatingRunFlowWindow, RunFlowDock, type RunFlowWindowMode } from './FloatingRunFlowWindow.tsx'
import { RUNFLOW_WINDOW_STYLES } from './floating-window-styles.ts'
import { RUNFLOW_SIDEBAR_STYLES } from './sidebar-styles.ts'
import { useFlowStore } from './store.ts'
import { connectFlowLocale, useRunFlowLocale } from './locale.ts'
import { FLOW_STYLES } from './styles.ts'
import { RUNFLOW_V2_STYLES } from './runflow-v2-styles.ts'
import {
  compactExecutionTime, executionStatusLabel, latestExecutionFor, workflowTriggerSummary,
} from './workflow-summary.ts'

type FlowLauncherProps = PropsRuntime<'sidebar.footer.action'>

export const DEFAULT_RUNFLOW_WINDOW_MODE: RunFlowWindowMode = 'maximized'

function FlowLauncher({ wide }: FlowLauncherProps) {
  const { language, t } = useRunFlowLocale()
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [windowMode, setWindowMode] = useState<RunFlowWindowMode>(DEFAULT_RUNFLOW_WINDOW_MODE)
  const [closing, setClosing] = useState(false)
  const [preview, setPreview] = useState(false)
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState({ left: 72, bottom: 12 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const showTimer = useRef<number>()
  const closeTimer = useRef<number>()
  const animationTimer = useRef<number>()
  const lastLoadedAt = useRef(0)
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const refreshWorkspace = useFlowStore(state => state.refreshWorkspace)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const runtime = useFlowRuntime()

  const clearTimers = useCallback(() => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current)
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    if (animationTimer.current !== undefined) window.clearTimeout(animationTimer.current)
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  const loadPreview = useCallback(async (): Promise<void> => {
    if (runtime.sessionId === undefined || Date.now() - lastLoadedAt.current < 10_000) return
    setLoading(true)
    try {
      await refreshWorkspace()
      lastLoadedAt.current = Date.now()
    } finally {
      setLoading(false)
    }
  }, [refreshWorkspace, runtime.sessionId])

  const show = useCallback(() => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect !== undefined) {
      setPosition({
        left: Math.max(12, Math.min(rect.right + 12, window.innerWidth - 380)),
        bottom: Math.max(12, window.innerHeight - rect.bottom),
      })
    }
    setPreview(true)
    void loadPreview()
  }, [loadPreview])
  const scheduleShow = (): void => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current)
    showTimer.current = window.setTimeout(show, 180)
  }
  const scheduleClose = (): void => {
    if (showTimer.current !== undefined) window.clearTimeout(showTimer.current)
    closeTimer.current = window.setTimeout(() => setPreview(false), 240)
  }
  const openRunFlow = (workflowId?: string): void => {
    clearTimers()
    setPreview(false)
    setClosing(false)
    setMinimized(false)
    setWindowMode(DEFAULT_RUNFLOW_WINDOW_MODE)
    if (workflowId !== undefined) openWorkflow(workflowId)
    setOpen(true)
  }
  const close = useCallback((): void => {
    if (closing) return
    setClosing(true)
    animationTimer.current = window.setTimeout(() => {
      setOpen(false)
      setMinimized(false)
      setClosing(false)
      requestAnimationFrame(() => triggerRef.current?.focus())
    }, 170)
  }, [closing])
  const minimize = (): void => {
    setClosing(false)
    setMinimized(true)
  }
  const restore = (): void => {
    setClosing(false)
    setMinimized(false)
  }
  useEffect(() => {
    if (!open) return
    const onHostPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-runflow-surface], .flow-launcher') !== null) return
      close()
    }
    document.addEventListener('pointerdown', onHostPointerDown, true)
    return () => document.removeEventListener('pointerdown', onHostPointerDown, true)
  }, [close, open])
  const runningCount = executions.filter(execution => execution.status === 'RUNNING' || execution.status === 'PENDING').length

  return (
    <div className="flow-launcher" onMouseLeave={scheduleClose} style={{ '--flow-launch-align': wide ? 'flex-start' : 'center' } as CSSProperties}>
      <style>{FLOW_STYLES + RUNFLOW_SIDEBAR_STYLES + RUNFLOW_WINDOW_STYLES + RUNFLOW_V2_STYLES}</style>
      <button ref={triggerRef} type="button" className="flow-launcher-button" onMouseEnter={scheduleShow} onFocus={show} onBlur={scheduleClose} onClick={() => open ? close() : openRunFlow()} aria-label={open ? t('close') : t('openManager')} aria-expanded={preview || open} aria-controls="dsh-runflow-workflow-preview">
        <RunFlowMark size={20} />{wide && <span>RunFlow</span>}
      </button>
      {preview && !open && createPortal(<section id="dsh-runflow-workflow-preview" className="runflow-host-preview" style={position} onMouseEnter={show} onMouseLeave={scheduleClose} onFocus={show} onBlur={scheduleClose} aria-label="RunFlow 工作流概览">
        <header>
          <span className="runflow-host-preview-icon"><RunFlowMark size={20} /></span>
          <span><strong>{t('previewTitle')}</strong><small>{t('workflowCount', { count: workflows.length })}</small></span>
          {loading ? <LoaderCircle className="runflow-preview-spin" size={15} /> : runningCount > 0 ? <span className="runflow-live-count"><Activity size={12} />{runningCount}</span> : null}
        </header>
        <div className="runflow-host-preview-list">
          {workflows.map(workflow => {
            const trigger = workflowTriggerSummary(workflow, language)
            const latest = latestExecutionFor(workflow.id, executions)
            const status = latest?.status.toLowerCase() ?? 'empty'
            return <button key={workflow.id} onClick={() => openRunFlow(workflow.id)}>
              <span className="runflow-host-workflow-main"><strong>{workflow.name}</strong><small><Clock3 size={11} />{trigger.label} · {trigger.detail}</small></span>
              <span className={'runflow-host-workflow-result status-' + status}>
                {latest?.status === 'SUCCESS' ? <CircleCheckBig size={13} /> : latest?.status === 'FAILED' || latest?.status === 'CANCELLED' ? <CircleX size={13} /> : <CircleDashed size={13} />}
                <span><strong>{executionStatusLabel(latest?.status, language)}</strong><small>{compactExecutionTime(latest?.startedAt, language)}</small></span>
              </span>
            </button>
          })}
          {workflows.length === 0 && <div className="runflow-host-preview-empty">{t('emptyHost')}</div>}
        </div>
        <footer><button onClick={() => openRunFlow()}><RunFlowMark size={16} />{t('openManager')}</button>{executions.length > 0 && <span>{t('recentRecords', { count: executions.length })}</span>}</footer>
      </section>, document.body)}
      {open && createPortal(minimized
        ? <RunFlowDock workflowCount={workflows.length} closing={closing} onRestore={restore} onClose={close} />
        : <FloatingRunFlowWindow mode={windowMode} closing={closing} onMinimize={minimize} onToggleMaximize={() => setWindowMode(mode => mode === 'floating' ? 'maximized' : 'floating')} onClose={close} />,
      document.body)}
    </div>
  )
}

export const name = 'dsh-runflow-client'
// directoryFor resolves remote.session through the consuming Cordis context.
export const inject = ['slots', 'sessions', 'modelDirectories', 'remote', 'remote.session', 'locale']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disconnectLocale = connectFlowLocale(ctx)
  const disconnectRuntime = await connectFlowRuntime(ctx)
  ctx.effect(() => connectFlowModelCatalog(ctx), 'dsh-runflow: model directory bridge')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-runflow',
    order: 8,
  }, FlowLauncher))
  return async () => { disconnectLocale(); await disconnectRuntime() }
}

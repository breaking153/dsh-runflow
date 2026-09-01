import { useEffect, useState } from 'react'
import {
  Activity, CircleCheckBig, CircleDashed, CircleX, Clock3, PanelLeftClose,
  PanelLeftOpen, Plus, Search, Workflow, X, Zap,
} from 'lucide-react'
import type { WorkflowExecution } from '../contracts.ts'
import { RunFlowMark } from './RunFlowLogo.tsx'
import { useFlowRuntime } from './runtime.ts'
import { useFlowStore } from './store.ts'
import {
  compactExecutionTime, executionStatusLabel, latestExecutionFor, workflowTriggerSummary,
} from './workflow-summary.ts'

function initialCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem('dsh-runflow:sidebar-collapsed') === 'true'
}

function ExecutionIcon({ execution }: { execution: WorkflowExecution | undefined }) {
  if (execution?.status === 'SUCCESS') return <CircleCheckBig size={13} />
  if (execution?.status === 'FAILED' || execution?.status === 'CANCELLED') return <CircleX size={13} />
  return <CircleDashed size={13} />
}

export function WorkflowSidebar({ onClose }: { onClose?: (() => void) | undefined }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [query, setQuery] = useState('')
  const view = useFlowStore(state => state.view)
  const workflowId = useFlowStore(state => state.workflowId)
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const loading = useFlowStore(state => state.workspaceLoading)
  const setView = useFlowStore(state => state.setView)
  const createWorkflow = useFlowStore(state => state.createWorkflow)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const runtime = useFlowRuntime()
  useEffect(() => localStorage.setItem('dsh-runflow:sidebar-collapsed', String(collapsed)), [collapsed])
  const visible = workflows.filter(workflow => workflow.name.toLowerCase().includes(query.trim().toLowerCase()))
  const toggle = (): void => setCollapsed(value => !value)

  return <aside className={'workflow-sidebar ' + (collapsed ? 'is-collapsed' : '')} aria-label="Workflow 管理">
    <header className="workflow-sidebar-brand">
      <span className="workflow-sidebar-logo"><RunFlowMark size={20} /></span>
      {!collapsed && <span className="workflow-sidebar-brand-copy"><strong>RunFlow</strong><small>DSH workflows</small></span>}
      <button onClick={toggle} aria-label={collapsed ? '展开 Workflow 管理栏' : '收起 Workflow 管理栏'} title={collapsed ? '展开侧栏' : '收起侧栏'}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
    </header>

    <button className="workflow-sidebar-create" onClick={createWorkflow} aria-label="新建工作流" title="新建工作流">
      <Plus size={17} />{!collapsed && <span>新建工作流</span>}
    </button>

    <nav className="workflow-sidebar-nav" aria-label="RunFlow 页面">
      <button className={view === 'workflows' ? 'active' : ''} onClick={() => setView('workflows')} title="工作流">
        <Workflow size={17} />{!collapsed && <span>工作流</span>}{!collapsed && <em>{workflows.length}</em>}
      </button>
      <button className={view === 'executions' ? 'active' : ''} onClick={() => setView('executions')} title="执行记录">
        <Activity size={17} />{!collapsed && <span>执行记录</span>}{!collapsed && <em>{executions.length}</em>}
      </button>
    </nav>

    {!collapsed && <section className="workflow-sidebar-library" aria-label="Workflow 列表">
      <div className="workflow-sidebar-section-head"><span>所有工作流</span>{loading && <small>同步中…</small>}</div>
      <label className="workflow-sidebar-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索工作流" aria-label="搜索工作流" /></label>
      <div className="workflow-sidebar-list">
        {visible.map(workflow => {
          const latest = latestExecutionFor(workflow.id, executions)
          const trigger = workflowTriggerSummary(workflow)
          const active = view === 'editor' && workflow.id === workflowId
          return <button key={workflow.id} className={'workflow-sidebar-item ' + (active ? 'active' : '')} onClick={() => openWorkflow(workflow.id)} aria-label={workflow.name + '，' + trigger.label + '，上次执行' + executionStatusLabel(latest?.status)}>
            <span className="workflow-sidebar-item-icon"><Workflow size={15} /></span>
            <span className="workflow-sidebar-item-copy">
              <strong>{workflow.name}</strong>
              <small><Clock3 size={11} />{trigger.label} · {compactExecutionTime(latest?.startedAt)}</small>
            </span>
            <span className={'workflow-sidebar-result status-' + (latest?.status.toLowerCase() ?? 'empty')} title={'上次执行：' + executionStatusLabel(latest?.status)}>
              <ExecutionIcon execution={latest} />
            </span>
          </button>
        })}
        {visible.length === 0 && <div className="workflow-sidebar-empty">没有匹配的工作流</div>}
      </div>
    </section>}

    <footer className="workflow-sidebar-footer">
      <span className={'workflow-sidebar-host ' + (runtime.sessionId === undefined ? 'offline' : '')} title={runtime.sessionId === undefined ? runtime.reason ?? 'Host disconnected' : 'DSH Host connected'}>
        <Zap size={14} />{!collapsed && <span>{runtime.sessionId === undefined ? 'Host 未连接' : 'Host 已连接'}</span>}
      </span>
      {onClose !== undefined && <button onClick={onClose} aria-label="关闭 RunFlow" title="关闭 RunFlow"><X size={17} /></button>}
    </footer>
  </aside>
}

import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import {
  Activity, Boxes, ChevronDown, ChevronRight, CircleCheckBig, CircleDashed, CircleX,
  Clock3, Code2, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plus, Search,
  Workflow, X, Zap,
} from 'lucide-react'
import type { WorkflowExecution, WorkflowNodeDescriptor } from '../contracts.ts'
import { NodeIcon } from './catalog.tsx'
import { buildNodeGroupTree, type NodeGroupTreeItem } from './node-groups.ts'
import { RunFlowMark } from './RunFlowLogo.tsx'
import { useFlowRuntime } from './runtime.ts'
import { useFlowStore } from './store.ts'
import {
  compactExecutionTime, executionStatusLabel, latestExecutionFor, workflowTriggerSummary,
} from './workflow-summary.ts'
import { useRunFlowLocale } from './locale.ts'
import { readBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'

export const RUNFLOW_NODE_DRAG_TYPE = 'application/x-dsh-runflow-node'
type SidebarTab = 'workflows' | 'nodes'

function initialCollapsed(): boolean {
  return readBrowserStorage('dsh-runflow:sidebar-collapsed') === 'true'
}

function ExecutionIcon({ execution }: { execution: WorkflowExecution | undefined }) {
  if (execution?.status === 'SUCCESS') return <CircleCheckBig size={13} />
  if (execution?.status === 'FAILED' || execution?.status === 'CANCELLED') return <CircleX size={13} />
  return <CircleDashed size={13} />
}

function groupNodeCount(group: NodeGroupTreeItem): number {
  return group.nodes.length + group.children.reduce((total, child) => total + groupNodeCount(child), 0)
}

function NodeTreeGroup({ group, depth, closed, onToggle, onInsert, onDragStart }: {
  group: NodeGroupTreeItem
  depth: number
  closed: ReadonlySet<string>
  onToggle(id: string): void
  onInsert(descriptor: WorkflowNodeDescriptor): void
  onDragStart(event: DragEvent<HTMLButtonElement>, descriptor: WorkflowNodeDescriptor): void
}) {
  const { t } = useRunFlowLocale()
  const collapsed = closed.has(group.id)
  const count = groupNodeCount(group)
  return <div className="workflow-node-group">
    <button className="workflow-node-group-toggle" style={{ '--group-depth': depth } as CSSProperties} onClick={() => onToggle(group.id)} aria-expanded={!collapsed}>
      {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
      <span>{group.name}</span><em>{count}</em>
    </button>
    {!collapsed && <div className="workflow-node-group-content">
      {group.nodes.map(descriptor => <button
        key={descriptor.type}
        className="workflow-node-library-item"
        style={{ '--node-color': descriptor.color, '--group-depth': depth } as CSSProperties}
        draggable={descriptor.available !== false}
        disabled={descriptor.available === false}
        onDragStart={event => onDragStart(event, descriptor)}
        onClick={() => onInsert(descriptor)}
        title={descriptor.available === false ? descriptor.description : descriptor.title}
      >
        <span className="workflow-node-library-icon"><NodeIcon name={descriptor.icon} size={15} /></span>
        <span><strong>{descriptor.title}</strong><small>{descriptor.type}</small></span>
        {descriptor.available === false && <i>{t('unavailable')}</i>}
      </button>)}
      {group.children.map(child => <NodeTreeGroup key={child.id} group={child} depth={depth + 1} closed={closed} onToggle={onToggle} onInsert={onInsert} onDragStart={onDragStart} />)}
    </div>}
  </div>
}

export function WorkflowSidebar({ onClose }: { onClose?: (() => void) | undefined }) {
  const { language, t } = useRunFlowLocale()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [tab, setTab] = useState<SidebarTab>('workflows')
  const [query, setQuery] = useState('')
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => new Set())
  const view = useFlowStore(state => state.view)
  const workflowId = useFlowStore(state => state.workflowId)
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const loading = useFlowStore(state => state.workspaceLoading)
  const setView = useFlowStore(state => state.setView)
  const createWorkflow = useFlowStore(state => state.createWorkflow)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const addNode = useFlowStore(state => state.addNode)
  const setSourceWorkbenchOpen = useFlowStore(state => state.setSourceWorkbenchOpen)
  const runtime = useFlowRuntime()
  useEffect(() => { writeBrowserStorage('dsh-runflow:sidebar-collapsed', String(collapsed)) }, [collapsed])
  const normalizedQuery = query.trim().toLowerCase()
  const visibleWorkflows = workflows.filter(workflow => workflow.name.toLowerCase().includes(normalizedQuery))
  const visibleNodes = useMemo(() => nodeCatalog.filter(descriptor => normalizedQuery === ''
    || `${descriptor.title} ${descriptor.description} ${descriptor.type} ${descriptor.group ?? ''}`.toLowerCase().includes(normalizedQuery)), [nodeCatalog, normalizedQuery])
  const nodeTree = useMemo(() => buildNodeGroupTree(visibleNodes), [visibleNodes])
  const toggle = (): void => setCollapsed(value => !value)
  const selectTab = (next: SidebarTab): void => {
    setTab(next)
    setQuery('')
    if (collapsed) setCollapsed(false)
  }
  const toggleGroup = (id: string): void => setClosedGroups(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const insertNode = (descriptor: WorkflowNodeDescriptor): void => {
    if (view !== 'editor' || descriptor.available === false) return
    addNode(descriptor)
  }
  const beginNodeDrag = (event: DragEvent<HTMLButtonElement>, descriptor: WorkflowNodeDescriptor): void => {
    if (view !== 'editor' || descriptor.available === false) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData(RUNFLOW_NODE_DRAG_TYPE, descriptor.type)
    event.dataTransfer.setData('text/plain', descriptor.type)
  }

  return <aside className={'workflow-sidebar ' + (collapsed ? 'is-collapsed' : '')} aria-label="RunFlow 侧栏">
    <header className="workflow-sidebar-brand">
      <span className="workflow-sidebar-logo"><RunFlowMark size={20} /></span>
      {!collapsed && <span className="workflow-sidebar-brand-copy"><strong>RunFlow</strong><small>DSH workflows</small></span>}
      <button onClick={toggle} aria-label={collapsed ? t('expandSidebar') : t('collapseSidebar')} title={collapsed ? t('expandSidebar') : t('collapseSidebar')}>
        {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
      </button>
    </header>

    <nav className="workflow-sidebar-nav" aria-label="RunFlow 资源">
      <button className={tab === 'workflows' ? 'active' : ''} onClick={() => selectTab('workflows')} title={t('workflows')} aria-current={tab === 'workflows' ? 'page' : undefined}>
        <Workflow size={17} />{!collapsed && <span>{t('workflows')}</span>}{!collapsed && <em>{workflows.length}</em>}
      </button>
      <button className={tab === 'nodes' ? 'active' : ''} onClick={() => selectTab('nodes')} title={t('nodes')} aria-current={tab === 'nodes' ? 'page' : undefined}>
        <Boxes size={17} />{!collapsed && <span>{t('nodes')}</span>}{!collapsed && <em>{nodeCatalog.length}</em>}
      </button>
    </nav>

    {!collapsed && tab === 'workflows' && <section className="workflow-sidebar-library" aria-label="Workflow 列表">
      <div className="workflow-sidebar-section-head"><span>{t('workflows')}</span>{loading && <small>{t('syncing')}</small>}</div>
      <div className="workflow-sidebar-quick-actions">
        <button onClick={() => setView('workflows')} className={view === 'workflows' ? 'active' : ''}><LayoutDashboard size={13} />{t('overview')}</button>
        <button onClick={() => setView('executions')} className={view === 'executions' ? 'active' : ''}><Activity size={13} />{t('executions')}</button>
      </div>
      <button className="workflow-sidebar-create" onClick={createWorkflow} aria-label={t('createWorkflow')} title={t('createWorkflow')}><Plus size={16} /><span>{t('createWorkflow')}</span></button>
      <label className="workflow-sidebar-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchWorkflows')} aria-label={t('searchWorkflows')} /></label>
      <div className="workflow-sidebar-list">
        {visibleWorkflows.map(workflow => {
          const latest = latestExecutionFor(workflow.id, executions)
          const trigger = workflowTriggerSummary(workflow, language)
          const active = view === 'editor' && workflow.id === workflowId
          return <button key={workflow.id} className={'workflow-sidebar-item ' + (active ? 'active' : '')} onClick={() => openWorkflow(workflow.id)} aria-label={workflow.name + ', ' + trigger.label + ', ' + executionStatusLabel(latest?.status, language)}>
            <span className="workflow-sidebar-item-icon"><Workflow size={15} /></span>
            <span className="workflow-sidebar-item-copy"><strong>{workflow.name}</strong><small><Clock3 size={11} />{trigger.label} · {compactExecutionTime(latest?.startedAt, language)}</small></span>
            <span className={'workflow-sidebar-result status-' + (latest?.status.toLowerCase() ?? 'empty')} title={executionStatusLabel(latest?.status, language)}><ExecutionIcon execution={latest} /></span>
          </button>
        })}
        {visibleWorkflows.length === 0 && <div className="workflow-sidebar-empty">{t('noWorkflows')}</div>}
      </div>
    </section>}

    {!collapsed && tab === 'nodes' && <section className="workflow-sidebar-library workflow-sidebar-nodes" aria-label="Node library">
      <div className="workflow-sidebar-section-head"><span>{t('nodeLibrary')}</span><small>{visibleNodes.length} {t('nodes').toLowerCase()}</small></div>
      <label className="workflow-sidebar-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchNodesShort')} aria-label={t('searchNodesShort')} /></label>
      {view !== 'editor' && <div className="workflow-node-library-hint">{t('openWorkflowHint')}</div>}
      <div className="workflow-node-tree">
        {nodeTree.map(group => <NodeTreeGroup key={group.id} group={group} depth={0} closed={closedGroups} onToggle={toggleGroup} onInsert={insertNode} onDragStart={beginNodeDrag} />)}
        {nodeTree.length === 0 && <div className="workflow-sidebar-empty">{t('noMatchingNodes')}</div>}
      </div>
      <button className="workflow-node-lab-action" onClick={() => setSourceWorkbenchOpen(true)}><Code2 size={15} /><span><strong>Node Lab</strong><small>{t('nodeLabDescription')}</small></span><ChevronRight size={14} /></button>
    </section>}

    <footer className="workflow-sidebar-footer">
      <span className={'workflow-sidebar-host ' + (runtime.sessionId === undefined ? 'offline' : '')} title={runtime.sessionId === undefined ? runtime.reason ?? t('hostDisconnected') : t('hostConnected')}>
        <Zap size={14} />{!collapsed && <span>{runtime.sessionId === undefined ? t('hostDisconnected') : t('hostOnline')}</span>}
      </span>
      {onClose !== undefined && <button onClick={onClose} aria-label={t('close')} title={t('close')}><X size={17} /></button>}
    </footer>
  </aside>
}

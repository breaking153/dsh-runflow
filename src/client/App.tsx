import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Background, BackgroundVariant, ConnectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  SelectionMode, useReactFlow, type Connection, type IsValidConnection, type NodeTypes, type OnConnectEnd,
} from '@xyflow/react'
import {
  Activity, ArrowLeft, ChevronDown, CircleAlert, Clock3, Copy, Download,
  Eye, EyeOff, FileClock, Filter, Focus, History, LayoutDashboard, LayoutTemplate, Map, MoreHorizontal,
  Keyboard, Play, Plus, Redo2, Search, SlidersHorizontal, Square, Star, Trash2, Undo2, Workflow, X, Zap,
} from 'lucide-react'
import type { NodeCategory, WorkflowExecution, WorkflowPortType } from '../contracts.ts'
import { CATEGORY_LABELS, NodeIcon } from './catalog.tsx'
import { ExecutionDock } from './ExecutionDock.tsx'
import { InspectorPanel } from './InspectorPanel.tsx'
import { NodeDetailsDialog } from './NodeDetailsDialog.tsx'
import { useFlowRuntime } from './runtime.ts'
import { FLOW_STYLES } from './styles.ts'
import { FLOW_REDESIGN_STYLES } from './redesign-styles.ts'
import { COMFY_INTERACTION_STYLES } from './comfy-interactions-styles.ts'
import { RUNFLOW_RESPONSIVE_STYLES } from './responsive-styles.ts'
import { RUNFLOW_V2_STYLES } from './runflow-v2-styles.ts'
import { RUNFLOW_SIDEBAR_STYLES } from './sidebar-styles.ts'
import { CODE_EDITOR_STYLES } from './code-editor-styles.ts'
import { type FlowNode, useFlowStore } from './store.ts'
import { RUNFLOW_NODE_DRAG_TYPE, WorkflowSidebar } from './WorkflowSidebar.tsx'
import { WorkflowNode } from './WorkflowNode.tsx'
import { SourceWorkbench } from './SourceWorkbench.tsx'
import { RerouteNode, SubflowNode, WorkflowGroupNode } from './GraphNodes.tsx'
import { CanvasContextMenu, CommandPalette, SelectionToolbar, type CanvasMenuState } from './EditorOverlays.tsx'
import { commandForKeyboardEvent, type EditorCommandId } from './editor-commands.ts'
import { favoriteNodeTypes, rankNodeDescriptors, recentNodeTypes, rememberNodeType, toggleFavoriteNodeType, type NodeSearchScope } from './node-search.ts'
import { TemplateBrowser } from './TemplateBrowser.tsx'
import { KeybindingSettings } from './KeybindingSettings.tsx'
import { compatiblePortTypes, normalizeNodeConnection } from './connection-planning.ts'
import { nodeGroupLabel } from './node-groups.ts'
import { useResizablePanel } from './use-resizable-panel.ts'
import { relativeTime, useRunFlowLocale } from './locale.ts'

const nodeTypes: NodeTypes = { workflow: WorkflowNode, 'runflow-group': WorkflowGroupNode, 'runflow-reroute': RerouteNode, 'runflow-subflow': SubflowNode }
type CreatorRequest = {
  clientX: number
  clientY: number
  flowX: number
  flowY: number
  direction?: 'source' | 'target'
  nodeId?: string
  handleId?: string
  portType?: WorkflowPortType
}
function duration(execution: WorkflowExecution): string {
  if (execution.startedAt === undefined) return '-'
  const ms = Math.max(0, new Date(execution.finishedAt ?? Date.now()).getTime() - new Date(execution.startedAt).getTime())
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(2) + 's'
}
function downloadJson(): void {
  const definition = useFlowStore.getState().definition()
  const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = definition.id + '.json'
  anchor.click()
  URL.revokeObjectURL(href)
}

function WorkflowsPage() {
  const { language, t } = useRunFlowLocale()
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const loading = useFlowStore(state => state.workspaceLoading)
  const error = useFlowStore(state => state.workspaceError)
  const createWorkflow = useFlowStore(state => state.createWorkflow)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const duplicateWorkflow = useFlowStore(state => state.duplicateWorkflow)
  const deleteWorkflow = useFlowStore(state => state.deleteWorkflow)
  const [query, setQuery] = useState('')
  const filtered = workflows.filter(item => {
    const search = query.trim().toLowerCase()
    return search === '' || (item.name + ' ' + item.id).toLowerCase().includes(search)
  })
  return <section className="workspace-page">
    <header className="page-header">
      <div><p>{t('overview')}</p><h1>{t('workflows')}</h1><span>{t('workflowIntro')}</span></div>
      <button className="primary-action" onClick={createWorkflow}><Plus size={16} />{t('createWorkflow')}</button>
    </header>
    <div className="page-filters">
      <label className="page-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchWorkflows')} /></label>
    </div>
    {error !== undefined && <div className="page-error" role="alert"><CircleAlert size={16} />{error}</div>}
    <div className="workflow-table" aria-busy={loading}>
      <div className="table-head"><span>{t('name')}</span><span>{t('lastExecution')}</span><span>{t('updated')}</span><span>{t('actions')}</span></div>
      {filtered.map(workflow => {
        const latest = executions.find(item => item.workflowId === workflow.id)
        return <div className="workflow-row" key={workflow.id}>
          <button className="workflow-main" onClick={() => openWorkflow(workflow.id)}>
            <span className="workflow-avatar"><Workflow size={17} /></span>
            <span><strong>{workflow.name}</strong><small>{workflow.nodes.length} {t('nodes').toLowerCase()} · v{workflow.version}</small></span>
          </button>
          <span className={'execution-chip ' + (latest?.status.toLowerCase() ?? 'empty')}>{latest?.status ?? t('noRuns')}</span>
          <span className="muted-cell">{relativeTime(workflow.updatedAt, language)}</span>
          <span className="row-actions">
            <button onClick={() => duplicateWorkflow(workflow.id)} aria-label={t('duplicate') + ' ' + workflow.name} title={t('duplicate')}><Copy size={15} /></button>
            <button onClick={() => void deleteWorkflow(workflow.id)} aria-label={t('delete') + ' ' + workflow.name} title={t('delete')}><Trash2 size={15} /></button>
          </span>
        </div>
      })}
      {filtered.length === 0 && <div className="empty-state"><Workflow size={30} /><strong>{t('noWorkflows')}</strong><span>{t('noWorkflowsHint')}</span></div>}
    </div>
  </section>
}

function ExecutionsPage({ workflowId }: { workflowId?: string }) {
  const { t } = useRunFlowLocale()
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const [status, setStatus] = useState('all')
  const [flow, setFlow] = useState(workflowId ?? 'all')
  useEffect(() => { if (workflowId !== undefined) setFlow(workflowId) }, [workflowId])
  const rows = executions.filter(item => (flow === 'all' || item.workflowId === flow) && (status === 'all' || item.status === status))
  return <section className="workspace-page executions-page">
    <header className="page-header"><div><p>{t('activity')}</p><h1>{t('executions')}</h1><span>{t('executionIntro')}</span></div></header>
    <div className="page-filters">
      <label className="filter-select"><Workflow size={14} /><select value={flow} onChange={event => setFlow(event.target.value)}><option value="all">{t('allWorkflows')}</option>{workflows.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="filter-select"><Filter size={14} /><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">{t('allStatuses')}</option><option>SUCCESS</option><option>FAILED</option><option>RUNNING</option><option>CANCELLED</option></select></label>
    </div>
    <div className="execution-table">
      <div className="execution-head"><span>{t('lastExecution')}</span><span>{t('workflows')}</span><span>{t('started')}</span><span>{t('duration')}</span><span>{t('trigger')}</span></div>
      {rows.map(execution => {
        const workflow = workflows.find(item => item.id === execution.workflowId)
        const firstNode = execution.nodes[0]?.nodeId
        return <button className="execution-list-row" key={execution.id} onClick={() => {
          if (workflow !== undefined) openWorkflow(workflow.id)
          if (firstNode !== undefined) openNodeDetails(firstNode, undefined, execution.id)
        }}>
          <span className={'execution-chip ' + execution.status.toLowerCase()}>{execution.status}</span>
          <span><strong>{workflow?.name ?? execution.workflowId}</strong><small>{execution.id.slice(0, 12)}</small></span>
          <time>{execution.startedAt === undefined ? '-' : new Date(execution.startedAt).toLocaleString()}</time>
          <span>{duration(execution)}</span><span>{execution.trigger}</span>
        </button>
      })}
      {rows.length === 0 && <div className="empty-state"><FileClock size={30} /><strong>{t('noExecutions')}</strong><span>{t('noExecutionsHint')}</span></div>}
    </div>
  </section>
}

function NodeCreator({ request, onClose, onChoose }: {
  request: CreatorRequest
  onClose(): void
  onChoose(type: string): void
}) {
  const { t } = useRunFlowLocale()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [scope, setScope] = useState<NodeSearchScope>('all')
  const [favorites, setFavorites] = useState(favoriteNodeTypes)
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const recent = recentNodeTypes()
  const compatibleItems = nodeCatalog.filter(item => {
    if (item.available === false) return false
    if (request.portType !== undefined && request.direction === 'source' && !(item.inputs ?? []).some(port => compatiblePortTypes(request.portType!, port.type))) return false
    if (request.portType !== undefined && request.direction === 'target' && !(item.outputs ?? []).some(port => compatiblePortTypes(port.type, request.portType!))) return false
    return true
  })
  const ranked = rankNodeDescriptors(compatibleItems, query)
  const scoped = ranked.filter(item => scope === 'all'
    || (scope === 'recent' && recent.includes(item.type))
    || (scope === 'favorites' && favorites.includes(item.type))
    || item.category === scope)
  const items = query.trim() !== '' || scope !== 'all' ? scoped : [...scoped].sort((a, b) => {
    const ai = recent.indexOf(a.type); const bi = recent.indexOf(b.type)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })
  const active = items[activeIndex]
  const chooseItem = (type: string): void => { rememberNodeType(type); onChoose(type) }
  const left = Math.min(request.clientX + 8, window.innerWidth - 350)
  const top = Math.min(request.clientY + 8, window.innerHeight - 520)
  useEffect(() => setActiveIndex(0), [query, request.portType, scope])
  const categories = (Object.keys(CATEGORY_LABELS) as NodeCategory[]).filter(category => compatibleItems.some(item => item.category === category))
  return <>
    <button className="creator-scrim" onClick={onClose} aria-label="Close node creator" />
    <section className="node-creator node-search-browser" style={{ left: Math.max(68, left - 180), top: Math.max(54, top) }} role="dialog" aria-modal="true" aria-label="Add a node">
      <header><div><strong>{request.portType === undefined ? t('whatNext') : t('compatibleNode')}</strong>{request.portType !== undefined && <span>{request.direction === 'source' ? t('input') : t('outputs')} <em>{request.portType}</em></span>}</div><button onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>
      <div className="node-search-layout">
        <aside aria-label="Node categories">
          <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}><Workflow size={14} />{t('allNodes')}<span>{compatibleItems.length}</span></button>
          <button className={scope === 'recent' ? 'active' : ''} onClick={() => setScope('recent')}><History size={14} />{t('recent')}<span>{recent.filter(type => compatibleItems.some(item => item.type === type)).length}</span></button>
          <button className={scope === 'favorites' ? 'active' : ''} onClick={() => setScope('favorites')}><Star size={14} />{t('favorites')}<span>{favorites.filter(type => compatibleItems.some(item => item.type === type)).length}</span></button>
          <div />
          {categories.map(category => <button className={scope === category ? 'active' : ''} key={category} onClick={() => setScope(category)}><NodeIcon name={category === 'ai' ? 'bot' : category === 'logic' ? 'git-branch' : 'workflow'} />{CATEGORY_LABELS[category]}<span>{compatibleItems.filter(item => item.category === category).length}</span></button>)}
        </aside>
        <main>
          <label><Search size={16} /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); onClose() }
            if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(value => Math.min(items.length - 1, value + 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(value => Math.max(0, value - 1)) }
            if (event.key === 'Enter' && items[activeIndex] !== undefined) { event.preventDefault(); chooseItem(items[activeIndex]!.type) }
          }} placeholder={t('searchNodes')} role="combobox" aria-controls="runflow-node-results" aria-expanded="true" aria-activedescendant={active === undefined ? undefined : `node-result-${active.type}`} /></label>
          <div className="creator-list" id="runflow-node-results" role="listbox">
            {items.map((item, index) => <div id={`node-result-${item.type}`} role="option" aria-selected={index === activeIndex} className={index === activeIndex ? 'active' : ''} key={item.type} onMouseEnter={() => setActiveIndex(index)}>
              <button className="creator-result-main" onClick={() => chooseItem(item.type)}>
                <span className="creator-icon" style={{ '--item-color': item.color } as CSSProperties}><NodeIcon name={item.icon} /></span>
                <span><strong>{item.title}</strong><small>{nodeGroupLabel(item)} · {item.type}</small></span><Plus size={15} />
              </button>
              <button className={'creator-favorite ' + (favorites.includes(item.type) ? 'active' : '')} onClick={() => setFavorites(toggleFavoriteNodeType(item.type))} aria-label={`${favorites.includes(item.type) ? 'Remove' : 'Add'} ${item.title} favorite`}><Star size={13} fill={favorites.includes(item.type) ? 'currentColor' : 'none'} /></button>
            </div>)}
            {items.length === 0 && <div className="creator-empty">No compatible nodes found.</div>}
          </div>
        </main>
        <section className="node-search-preview" aria-live="polite">
          {active === undefined ? <div className="creator-empty">Choose a category or adjust the search.</div> : <>
            <span className="creator-icon large" style={{ '--item-color': active.color } as CSSProperties}><NodeIcon name={active.icon} /></span>
            <p>{nodeGroupLabel(active)}</p><h3>{active.title}</h3><code>{active.type}</code><span>{active.description}</span>
            <div><strong>{t('input')}</strong>{(active.inputs ?? []).map(port => <em key={port.id}>{port.label ?? port.id}<small>{port.type}</small></em>)}{(active.inputs ?? []).length === 0 && <i>{t('none')}</i>}</div>
            <div><strong>{t('outputs')}</strong>{(active.outputs ?? []).map(port => <em key={port.id}>{port.label ?? port.id}<small>{port.type}</small></em>)}{(active.outputs ?? []).length === 0 && <i>{t('none')}</i>}</div>
          </>}
        </section>
      </div>
    </section>
  </>
}

export function EditorHeader({ onTemplates, onKeybindings }: { onTemplates(): void; onKeybindings(): void }) {
  const { language, t } = useRunFlowLocale()
  const name = useFlowStore(state => state.workflowName)
  const setName = useFlowStore(state => state.setWorkflowName)
  const version = useFlowStore(state => state.version)
  const dirty = useFlowStore(state => state.dirty)
  const savedAt = useFlowStore(state => state.savedAt)
  const saveError = useFlowStore(state => state.saveError)
  const running = useFlowStore(state => state.running)
  const run = useFlowStore(state => state.run)
  const cancelRun = useFlowStore(state => state.cancelRun)
  const setView = useFlowStore(state => state.setView)
  const workflowOutputDir = useFlowStore(state => state.workflowOutputDir)
  const setWorkflowOutputDir = useFlowStore(state => state.setWorkflowOutputDir)
  const runInput = useFlowStore(state => state.runInput)
  const setRunInput = useFlowStore(state => state.setRunInput)
  const runtime = useFlowRuntime()
  const [runSettingsOpen, setRunSettingsOpen] = useState(false)
  const saveState = saveError !== undefined ? 'error' : dirty ? 'saving' : savedAt === undefined ? 'unsaved' : runtime.sessionId === undefined ? 'local' : 'saved'
  const saveStatus = saveError !== undefined ? `${t('saveFailed')}: ${saveError}`
    : dirty ? t('saving')
      : savedAt === undefined ? relativeTime(undefined, language)
        : `${t(saveState === 'local' ? 'localDraft' : 'saved')} · ${relativeTime(savedAt, language)}`
  return <header className="editor-header">
    <button className="back-button" onClick={() => setView('workflows')} aria-label={t('backToWorkflows')}><ArrowLeft size={17} /></button>
    <div className="editor-title"><input value={name} onChange={event => setName(event.target.value)} aria-label={t('workflowName')} /><span>v{version}</span></div>
    <span className={'autosave-state ' + saveState} role={saveError !== undefined ? 'alert' : 'status'} title={saveError}>
      {saveError !== undefined ? <CircleAlert size={12} aria-hidden="true" /> : saveState === 'unsaved' || saveState === 'local' ? <FileClock size={12} aria-hidden="true" /> : <span aria-hidden="true" />}{saveStatus}
    </span>
    <div className="editor-tabs"><button className="active">{t('editor')}</button><button onClick={() => setView('executions')}>{t('executions')}</button></div>
    <div className="editor-actions">
      <button className="icon-text-button compact-action" onClick={downloadJson} title={t('export')} aria-label={t('export')}><Download size={15} /><span>{t('export')}</span></button>
      <button className="icon-text-button compact-action" onClick={onTemplates} title={t('templates')} aria-label={t('templates')}><LayoutTemplate size={15} /><span>{t('templates')}</span></button>
      <button className="icon-text-button compact-action" onClick={onKeybindings} title={t('keys')} aria-label={t('keys')}><Keyboard size={15} /><span>{t('keys')}</span></button>
      <button className={'icon-text-button run-settings-toggle ' + (runSettingsOpen ? 'active' : '')} onClick={() => setRunSettingsOpen(value => !value)} aria-expanded={runSettingsOpen} aria-label={t('runSettings')}><SlidersHorizontal size={15} /><span>{t('runSettings')}</span></button>
      {runSettingsOpen && <section className="run-settings-popover" aria-label={t('runSettings')}>
        <header><strong>{t('runSettings')}</strong><button onClick={() => setRunSettingsOpen(false)} aria-label={t('close')}><X size={14} /></button></header>
        <label><span>{t('workflowOutputDir')}</span><input value={workflowOutputDir} onChange={event => setWorkflowOutputDir(event.target.value)} placeholder="~/.dsh_agent_workflow/output" /></label>
        <label><span>{t('runInput')}</span><textarea spellCheck={false} value={runInput} onChange={event => setRunInput(event.target.value)} /></label>
      </section>}
      <button className={'run-action ' + (running ? 'stopping' : '')} onClick={() => void (running ? cancelRun() : run())} disabled={!running && runtime.sessionId === undefined} aria-label={running ? t('stop') : t('executeWorkflow')}>
        {running ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{running ? t('stop') : t('executeWorkflow')}
      </button>
    </div>
  </header>
}

function CanvasEditor() {
  const { t } = useRunFlowLocale()
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const onNodesChange = useFlowStore(state => state.onNodesChange)
  const onEdgesChange = useFlowStore(state => state.onEdgesChange)
  const onConnect = useFlowStore(state => state.onConnect)
  const selectNode = useFlowStore(state => state.selectNode)
  const addNode = useFlowStore(state => state.addNode)
  const addConnectedNode = useFlowStore(state => state.addConnectedNode)
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const graphHistory = useFlowStore(state => state.graphHistory)
  const graphClipboard = useFlowStore(state => state.graphClipboard)
  const beginGraphGesture = useFlowStore(state => state.beginGraphGesture)
  const endGraphGesture = useFlowStore(state => state.endGraphGesture)
  const undoGraph = useFlowStore(state => state.undoGraph)
  const redoGraph = useFlowStore(state => state.redoGraph)
  const copySelection = useFlowStore(state => state.copySelection)
  const cutSelection = useFlowStore(state => state.cutSelection)
  const pasteSelection = useFlowStore(state => state.pasteSelection)
  const duplicateSelection = useFlowStore(state => state.duplicateSelection)
  const deleteSelection = useFlowStore(state => state.deleteSelection)
  const selectAllNodes = useFlowStore(state => state.selectAllNodes)
  const groupSelection = useFlowStore(state => state.groupSelection)
  const insertReroute = useFlowStore(state => state.insertReroute)
  const moveGroupChildren = useFlowStore(state => state.moveGroupChildren)
  const createSubflowFromSelection = useFlowStore(state => state.createSubflowFromSelection)
  const enterSubflow = useFlowStore(state => state.enterSubflow)
  const exitSubflow = useFlowStore(state => state.exitSubflow)
  const activeSubflowId = useFlowStore(state => state.activeSubflowId)
  const subflows = useFlowStore(state => state.subflows)
  const save = useFlowStore(state => state.save)
  const run = useFlowStore(state => state.run)
  const cancelRun = useFlowStore(state => state.cancelRun)
  const running = useFlowStore(state => state.running)
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow()
  const [creator, setCreator] = useState<CreatorRequest>()
  const [menu, setMenu] = useState<CanvasMenuState>()
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const selectedNodeId = useFlowStore(state => state.selectedNodeId)
  const review = useFlowStore(state => state.review)
  const inspectorPanel = useResizablePanel({
    storageKey: 'dsh-runflow:inspector-width', defaultSize: 360, minSize: 280, maxSize: 680,
    keyboardStep: 16, resizeFrom: 'start', label: t('resizeInspector'),
  })
  const rightGesture = useRef<{ x: number; y: number; moved: boolean }>()
  const suppressContextMenu = useRef(false)
  const linksVisible = useFlowStore(state => state.linksVisible)
  const minimapVisible = useFlowStore(state => state.minimapVisible)
  const setLinksVisible = useFlowStore(state => state.setLinksVisible)
  const setMinimapVisible = useFlowStore(state => state.setMinimapVisible)
  const selectedCount = nodes.filter(node => node.selected).length + edges.filter(edge => edge.selected).length
  const selectedWorkflowNodeCount = nodes.filter(node => node.selected && node.type === 'workflow').length
  const selectedNode = nodes.find(node => node.id === selectedNodeId)
  const showInspector = inspectorOpen && (selectedNode !== undefined || review !== undefined) && selectedCount <= 1
  const renderedEdges = useMemo(() => linksVisible ? edges : edges.map(edge => ({ ...edge, hidden: true })), [edges, linksVisible])
  const normalizedConnection = (connection: Parameters<IsValidConnection>[0]): Connection | undefined => normalizeNodeConnection(nodes, connection)
  const validConnection: IsValidConnection = connection => normalizedConnection(connection) !== undefined
  const connectNodes = (connection: Connection): void => {
    const normalized = normalizedConnection(connection)
    if (normalized !== undefined) onConnect(normalized)
  }
  const point = (event: MouseEvent | TouchEvent) => 'clientX' in event
    ? { x: event.clientX, y: event.clientY }
    : { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 }
  const connectionEnd: OnConnectEnd = (event, state) => {
    if (!state.fromNode || state.toNode !== null || state.isValid === true) return
    const p = point(event)
    const from = nodes.find(node => node.id === state.fromNode.id)
    const direction = state.fromHandle.type
    const port = direction === 'source'
      ? from?.data.outputs.find(item => item.id === state.fromHandle.id)
      : from?.data.inputs.find(item => item.id === state.fromHandle.id)
    const flow = screenToFlowPosition(p)
    setCreator({ clientX: p.x, clientY: p.y, flowX: flow.x, flowY: flow.y, direction, nodeId: state.fromNode.id, ...(state.fromHandle.id == null ? {} : { handleId: state.fromHandle.id }), ...(port === undefined ? {} : { portType: port.type }) })
  }
  const openCreatorAt = (clientX: number, clientY: number, flowPosition?: { x: number; y: number }): void => {
    const flow = flowPosition ?? screenToFlowPosition({ x: clientX, y: clientY })
    setMenu(undefined)
    setCreator({ clientX, clientY, flowX: flow.x, flowY: flow.y })
  }
  const executeCommand = (command: EditorCommandId): void => {
    if (command === 'workflow.save') void save()
    if (command === 'workflow.run') void (running ? cancelRun() : run())
    if (command === 'graph.undo') undoGraph()
    if (command === 'graph.redo') redoGraph()
    if (command === 'graph.copy') copySelection()
    if (command === 'graph.cut') cutSelection()
    if (command === 'graph.paste') pasteSelection()
    if (command === 'graph.duplicate') duplicateSelection()
    if (command === 'graph.delete') deleteSelection()
    if (command === 'graph.selectAll') selectAllNodes()
    if (command === 'graph.group') groupSelection()
    if (command === 'graph.subflow') createSubflowFromSelection()
    if (command === 'ui.commandPalette') setCommandPaletteOpen(open => !open)
    if (command === 'graph.addNode') openCreatorAt(window.innerWidth / 2, window.innerHeight / 2)
  }
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const command = commandForKeyboardEvent(event)
      if (command === undefined) return
      event.preventDefault()
      executeCommand(command)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  const choose = (type: string): void => {
    if (creator === undefined) return
    const descriptor = nodeCatalog.find(item => item.type === type)
    if (descriptor === undefined) return
    if (creator.direction !== undefined && creator.nodeId !== undefined) addConnectedNode(descriptor, { x: creator.flowX, y: creator.flowY }, {
      direction: creator.direction,
      nodeId: creator.nodeId,
      ...(creator.handleId === undefined ? {} : { handleId: creator.handleId }),
      ...(creator.portType === undefined ? {} : { portType: creator.portType }),
    })
    else addNode(descriptor, { x: creator.flowX, y: creator.flowY })
    setCreator(undefined)
    setInspectorOpen(true)
  }
  return <div className="editor-workspace">
    <main className="canvas-column" onContextMenu={event => event.preventDefault()} onPointerDownCapture={event => {
      if (event.button === 2) rightGesture.current = { x: event.clientX, y: event.clientY, moved: false }
    }} onPointerMoveCapture={event => {
      const gesture = rightGesture.current
      if (gesture !== undefined && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4) gesture.moved = true
    }} onPointerUpCapture={event => {
      if (event.button !== 2 || rightGesture.current === undefined) return
      suppressContextMenu.current = rightGesture.current.moved
      rightGesture.current = undefined
      window.setTimeout(() => { suppressContextMenu.current = false }, 0)
    }}>
      <div className="canvas-toolbar">
        {activeSubflowId !== undefined && <button className="subflow-breadcrumb" onClick={exitSubflow}><ArrowLeft size={13} /><span>{t('root')}</span><em>/</em><strong>{subflows.find(item => item.id === activeSubflowId)?.label ?? activeSubflowId}</strong></button>}
        <button className="add-node-button" onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const flow = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 })
          setCreator({ clientX: rect.left, clientY: rect.bottom + 8, flowX: flow.x, flowY: flow.y })
        }}><Plus size={16} />{t('addNode')}</button>
        <span className="selection-help">{t('selectHint')}</span>
        <div className="history-tools">
          <button onClick={undoGraph} disabled={graphHistory.past.length === 0} aria-label={t('undo')} title={`${t('undo')} (Ctrl+Z)`}><Undo2 size={14} /></button>
          <button onClick={redoGraph} disabled={graphHistory.future.length === 0} aria-label={t('redo')} title={`${t('redo')} (Ctrl+Shift+Z)`}><Redo2 size={14} /></button>
          <button onClick={() => setLinksVisible(!linksVisible)} aria-pressed={!linksVisible} aria-label={linksVisible ? t('hideLinks') : t('showLinks')} title={linksVisible ? t('hideLinks') : t('showLinks')}>{linksVisible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
          <button onClick={() => setMinimapVisible(!minimapVisible)} aria-pressed={minimapVisible} aria-label={t('toggleMinimap')} title={t('toggleMinimap')}><Map size={14} /></button>
        </div>
        <div className="canvas-tools"><button onClick={() => zoomOut()} aria-label={t('zoomOut')}>-</button><button onClick={() => fitView({ duration: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220, padding: .22 })} aria-label={t('fitView')}><Focus size={15} /></button><button onClick={() => zoomIn()} aria-label={t('zoomIn')}>+</button></div>
      </div>
      <ReactFlow
        className="flow-canvas"
        nodes={nodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connectNodes}
        onConnectEnd={connectionEnd}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(RUNFLOW_NODE_DRAG_TYPE)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={event => {
          const type = event.dataTransfer.getData(RUNFLOW_NODE_DRAG_TYPE)
          if (type === '') return
          const descriptor = nodeCatalog.find(item => item.type === type && item.available !== false)
          if (descriptor === undefined) return
          event.preventDefault()
          const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
          rememberNodeType(descriptor.type)
          addNode(descriptor, position)
          setInspectorOpen(true)
        }}
        onNodeDragStart={beginGraphGesture}
        onNodeDrag={(_event, node) => { if (node.type === 'runflow-group') moveGroupChildren(node.id, node.position) }}
        onNodeDragStop={endGraphGesture}
        onSelectionChange={({ nodes: selected }) => {
          if (selected.length === 1) selectNode(selected[0]?.id)
          else if (selected.length > 1) selectNode()
        }}
        onNodeDoubleClick={(_event, node) => { if (node.type === 'runflow-subflow') enterSubflow(node.id); else if (node.data.executionRecord !== undefined) openNodeDetails(node.id) }}
        onNodeClick={() => setInspectorOpen(true)}
        onPaneClick={() => { selectNode(); setCreator(undefined) }}
        onPaneContextMenu={event => {
          event.preventDefault()
          if (suppressContextMenu.current) return
          const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
          setCreator(undefined)
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 228), y: Math.min(event.clientY, window.innerHeight - 330), flowX: flow.x, flowY: flow.y, kind: 'pane' })
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          onNodesChange([{ id: node.id, type: 'select', selected: true }])
          selectNode(node.id)
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 228), y: Math.min(event.clientY, window.innerHeight - 330), flowX: node.position.x, flowY: node.position.y, kind: selectedCount > 1 ? 'selection' : 'node' })
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault()
          onEdgesChange([{ id: edge.id, type: 'select', selected: true }])
          const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 228), y: Math.min(event.clientY, window.innerHeight - 330), flowX: flow.x, flowY: flow.y, kind: 'edge', edgeId: edge.id })
        }}
        isValidConnection={validConnection}
        deleteKeyCode={null}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnDrag={[1, 2]}
        panActivationKeyCode={null}
        fitView
        fitViewOptions={{ padding: .23, maxZoom: 1.1 }}
        minZoom={.3}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[16, 16]}
        connectionRadius={36}
        connectionMode={ConnectionMode.Loose}
        connectionLineStyle={{ stroke: 'var(--dsw-alias-state-business-primary, #4a5fa8)', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: 'var(--dsw-alias-border-strong, #7182aa)', strokeWidth: 1.7 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#d7d9de" />
        {minimapVisible && <MiniMap pannable zoomable nodeColor={node => String(node.data.color ?? '#8b8f99')} maskColor="rgba(245,246,248,.72)" />}
        <Controls showInteractive={false} />
      </ReactFlow>
      <SelectionToolbar count={selectedCount} workflowNodeCount={selectedWorkflowNodeCount} onCommand={executeCommand} onClose={() => {
        onNodesChange(nodes.filter(node => node.selected).map(node => ({ id: node.id, type: 'select' as const, selected: false })))
        onEdgesChange(edges.filter(edge => edge.selected).map(edge => ({ id: edge.id, type: 'select' as const, selected: false })))
        selectNode()
      }} />
      <ExecutionDock />
      {creator !== undefined && <NodeCreator request={creator} onClose={() => setCreator(undefined)} onChoose={choose} />}
      {menu !== undefined && <CanvasContextMenu menu={menu} canPaste={(graphClipboard?.nodes.length ?? 0) > 0} canUndo={graphHistory.past.length > 0} canRedo={graphHistory.future.length > 0} onClose={() => setMenu(undefined)} onCommand={executeCommand} onAddNode={() => openCreatorAt(menu.x, menu.y, { x: menu.flowX, y: menu.flowY })} {...(menu.edgeId === undefined ? {} : { onReroute: () => insertReroute(menu.edgeId!, { x: menu.flowX, y: menu.flowY }) })} />}
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} onCommand={executeCommand} />
    </main>
    <div className={'inspector-wrap ' + (showInspector ? '' : 'closed')} style={showInspector ? { width: inspectorPanel.size, flexBasis: inspectorPanel.size } : undefined}>
      {showInspector && <><span className="inspector-resize-handle" {...inspectorPanel.separatorProps} /><InspectorPanel onClose={() => setInspectorOpen(false)} /></>}
    </div>
  </div>
}

function Editor() {
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [keybindingsOpen, setKeybindingsOpen] = useState(false)
  return <><EditorHeader onTemplates={() => setTemplatesOpen(true)} onKeybindings={() => setKeybindingsOpen(true)} /><ReactFlowProvider><CanvasEditor /></ReactFlowProvider><TemplateBrowser open={templatesOpen} onClose={() => setTemplatesOpen(false)} /><KeybindingSettings open={keybindingsOpen} onClose={() => setKeybindingsOpen(false)} /></>
}

function Shell({ onClose }: { onClose?: (() => void) | undefined }) {
  const { t } = useRunFlowLocale()
  const view = useFlowStore(state => state.view)
  const runtime = useFlowRuntime()
  const refresh = useFlowStore(state => state.refreshWorkspace)
  useEffect(() => { if (runtime.sessionId !== undefined) void refresh() }, [refresh, runtime.sessionId])
  return <div className="dsh-runflow-root"><style>{FLOW_STYLES + FLOW_REDESIGN_STYLES + RUNFLOW_SIDEBAR_STYLES + CODE_EDITOR_STYLES + COMFY_INTERACTION_STYLES + RUNFLOW_RESPONSIVE_STYLES + RUNFLOW_V2_STYLES}</style><div className="flow-app"><WorkflowSidebar onClose={onClose} /><div className="runflow-main">
    <div className="host-strip"><span className={runtime.sessionId === undefined ? 'offline' : ''}><Zap size={13} />{runtime.sessionId === undefined ? runtime.reason ?? t('hostDisconnected') : t('hostConnected')}</span></div>
    {view === 'workflows' && <WorkflowsPage />}
    {view === 'executions' && <ExecutionsPage />}
    {view === 'editor' && <Editor />}
  </div><NodeDetailsDialog /><SourceWorkbench /></div></div>
}

export function FlowApp({ onClose }: { onClose?: (() => void) | undefined }) { return <Shell onClose={onClose} /> }

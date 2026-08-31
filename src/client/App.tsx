import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  SelectionMode, useReactFlow, type Connection, type IsValidConnection, type NodeTypes, type OnConnectEnd,
} from '@xyflow/react'
import {
  Activity, ArrowLeft, Check, ChevronDown, CircleAlert, Clock3, Copy, Download,
  FileClock, Filter, Focus, LayoutDashboard, MoreHorizontal, Play, Plus, Save,
  Search, Sparkles, Square, Trash2, Workflow, X, Zap,
} from 'lucide-react'
import type { WorkflowExecution, WorkflowPortType } from '../contracts.ts'
import { CATEGORY_LABELS, NodeIcon } from './catalog.tsx'
import { ExecutionDock } from './ExecutionDock.tsx'
import { PropertyInspector } from './Panels.tsx'
import { NodeDetailsDialog } from './NodeDetailsDialog.tsx'
import { useFlowRuntime } from './runtime.ts'
import { FLOW_STYLES } from './styles.ts'
import { FLOW_REDESIGN_STYLES } from './redesign-styles.ts'
import { RUNFLOW_SIDEBAR_STYLES } from './sidebar-styles.ts'
import { CODE_EDITOR_STYLES } from './code-editor-styles.ts'
import { type FlowNode, useFlowStore } from './store.ts'
import { WorkflowSidebar } from './WorkflowSidebar.tsx'
import { WorkflowNode } from './WorkflowNode.tsx'
import { SourceWorkbench } from './SourceWorkbench.tsx'

const nodeTypes: NodeTypes = { workflow: WorkflowNode }
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
function compatible(a: WorkflowPortType, b: WorkflowPortType): boolean { return a === 'any' || b === 'any' || a === b }
function relativeTime(value?: string): string {
  if (value === undefined) return 'Not saved'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago'
  return Math.floor(seconds / 86400) + 'd ago'
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

function StatusPill({ published, dirty }: { published?: boolean; dirty?: boolean }) {
  return <span className={'workflow-status ' + (published ? 'published' : 'draft')}>
    <span />{published ? (dirty ? 'Published - draft changes' : 'Published') : 'Draft'}
  </span>
}

function WorkflowsPage() {
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const loading = useFlowStore(state => state.workspaceLoading)
  const error = useFlowStore(state => state.workspaceError)
  const createWorkflow = useFlowStore(state => state.createWorkflow)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const duplicateWorkflow = useFlowStore(state => state.duplicateWorkflow)
  const deleteWorkflow = useFlowStore(state => state.deleteWorkflow)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all')
  const filtered = workflows.filter(item => {
    const search = query.trim().toLowerCase()
    return (search === '' || (item.name + ' ' + item.id).toLowerCase().includes(search))
      && (status === 'all' || (status === 'published' ? item.published : !item.published))
  })
  return <section className="workspace-page">
    <header className="page-header">
      <div><p>Overview</p><h1>Workflows</h1><span>Build and manage automations running inside DeepSeek Harness.</span></div>
      <button className="primary-action" onClick={createWorkflow}><Plus size={16} />Create workflow</button>
    </header>
    <div className="page-filters">
      <label className="page-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search workflows" /></label>
      <label className="filter-select"><Filter size={14} /><select value={status} onChange={event => setStatus(event.target.value as typeof status)}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option></select></label>
    </div>
    {error !== undefined && <div className="page-error" role="alert"><CircleAlert size={16} />{error}</div>}
    <div className="workflow-table" aria-busy={loading}>
      <div className="table-head"><span>Name</span><span>Status</span><span>Last execution</span><span>Updated</span><span /></div>
      {filtered.map(workflow => {
        const latest = executions.find(item => item.workflowId === workflow.id)
        return <div className="workflow-row" key={workflow.id}>
          <button className="workflow-main" onClick={() => openWorkflow(workflow.id)}>
            <span className="workflow-avatar"><Workflow size={17} /></span>
            <span><strong>{workflow.name}</strong><small>{workflow.nodes.length} nodes - v{workflow.version}</small></span>
          </button>
          <StatusPill published={workflow.published ?? false} />
          <span className={'execution-chip ' + (latest?.status.toLowerCase() ?? 'empty')}>{latest?.status ?? 'No runs'}</span>
          <span className="muted-cell">{relativeTime(workflow.updatedAt)}</span>
          <span className="row-actions">
            <button onClick={() => duplicateWorkflow(workflow.id)} aria-label={'Duplicate ' + workflow.name} title="Duplicate"><Copy size={15} /></button>
            <button onClick={() => void deleteWorkflow(workflow.id)} aria-label={'Delete ' + workflow.name} title="Delete"><Trash2 size={15} /></button>
          </span>
        </div>
      })}
      {filtered.length === 0 && <div className="empty-state"><Workflow size={30} /><strong>No workflows found</strong><span>Create a workflow or change the filters.</span></div>}
    </div>
  </section>
}

function ExecutionsPage({ workflowId }: { workflowId?: string }) {
  const workflows = useFlowStore(state => state.workflows)
  const executions = useFlowStore(state => state.executions)
  const openWorkflow = useFlowStore(state => state.openWorkflow)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const [status, setStatus] = useState('all')
  const [flow, setFlow] = useState(workflowId ?? 'all')
  useEffect(() => { if (workflowId !== undefined) setFlow(workflowId) }, [workflowId])
  const rows = executions.filter(item => (flow === 'all' || item.workflowId === flow) && (status === 'all' || item.status === status))
  return <section className="workspace-page executions-page">
    <header className="page-header"><div><p>Activity</p><h1>Executions</h1><span>Inspect every Host run, result, artifact and failure.</span></div></header>
    <div className="page-filters">
      <label className="filter-select"><Workflow size={14} /><select value={flow} onChange={event => setFlow(event.target.value)}><option value="all">All workflows</option>{workflows.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label className="filter-select"><Filter size={14} /><select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option>SUCCESS</option><option>FAILED</option><option>RUNNING</option><option>CANCELLED</option></select></label>
    </div>
    <div className="execution-table">
      <div className="execution-head"><span>Status</span><span>Workflow</span><span>Started</span><span>Duration</span><span>Trigger</span></div>
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
      {rows.length === 0 && <div className="empty-state"><FileClock size={30} /><strong>No executions yet</strong><span>Run a workflow to see its history here.</span></div>}
    </div>
  </section>
}

function NodeCreator({ request, onClose, onChoose }: {
  request: CreatorRequest
  onClose(): void
  onChoose(type: string): void
}) {
  const [query, setQuery] = useState('')
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const items = nodeCatalog.filter(item => {
    if (item.available === false) return false
    if (request.portType !== undefined && request.direction === 'source' && !(item.inputs ?? []).some(port => compatible(request.portType!, port.type))) return false
    if (request.portType !== undefined && request.direction === 'target' && !(item.outputs ?? []).some(port => compatible(port.type, request.portType!))) return false
    const needle = query.trim().toLowerCase()
    return needle === '' || (item.title + ' ' + item.description + ' ' + item.type).toLowerCase().includes(needle)
  })
  const left = Math.min(request.clientX + 8, window.innerWidth - 350)
  const top = Math.min(request.clientY + 8, window.innerHeight - 520)
  return <>
    <button className="creator-scrim" onClick={onClose} aria-label="Close node creator" />
    <section className="node-creator" style={{ left: Math.max(68, left), top: Math.max(64, top) }} role="dialog" aria-label="Add a node">
      <header><div><strong>{request.portType === undefined ? 'What happens next?' : 'Connect a compatible node'}</strong>{request.portType !== undefined && <span>{request.direction === 'source' ? 'Accepts' : 'Outputs'} <em>{request.portType}</em></span>}</div><button onClick={onClose} aria-label="Close"><X size={16} /></button></header>
      <label><Search size={16} /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search nodes..." /></label>
      <div className="creator-list">
        {items.map(item => <button key={item.type} onClick={() => onChoose(item.type)}>
          <span className="creator-icon" style={{ '--item-color': item.color } as CSSProperties}><NodeIcon name={item.icon} /></span>
          <span><strong>{item.title}</strong><small>{CATEGORY_LABELS[item.category]} - {item.description}</small></span><Plus size={15} />
        </button>)}
        {items.length === 0 && <div className="creator-empty">No compatible nodes found.</div>}
      </div>
    </section>
  </>
}

function EditorHeader() {
  const name = useFlowStore(state => state.workflowName)
  const setName = useFlowStore(state => state.setWorkflowName)
  const version = useFlowStore(state => state.version)
  const dirty = useFlowStore(state => state.dirty)
  const published = useFlowStore(state => state.published)
  const saveError = useFlowStore(state => state.saveError)
  const running = useFlowStore(state => state.running)
  const save = useFlowStore(state => state.save)
  const run = useFlowStore(state => state.run)
  const cancelRun = useFlowStore(state => state.cancelRun)
  const setPublished = useFlowStore(state => state.setPublished)
  const setView = useFlowStore(state => state.setView)
  const capabilities = useFlowStore(state => state.capabilities)
  const setSourceWorkbenchOpen = useFlowStore(state => state.setSourceWorkbenchOpen)
  const runtime = useFlowRuntime()
  return <header className="editor-header">
    <button className="back-button" onClick={() => setView('workflows')} aria-label="Back to workflows"><ArrowLeft size={17} /></button>
    <div className="editor-title"><input value={name} onChange={event => setName(event.target.value)} aria-label="Workflow name" /><span>v{version}</span><StatusPill published={published} dirty={dirty} /></div>
    <div className="editor-tabs"><button className="active">Editor</button><button onClick={() => setView('executions')}>Executions</button></div>
    <div className="editor-actions">
      {saveError !== undefined && <span className="header-error" title={saveError}><CircleAlert size={14} />Save failed</span>}
      <button className="icon-text-button" onClick={downloadJson}><Download size={15} />Export</button>
      <button className="icon-text-button" onClick={() => setSourceWorkbenchOpen(true)} title={capabilities.sourceAuthoring ? '编辑并热重载 Node / Script' : '切换到创造模式后可编辑可信源码'}><Sparkles size={15} />Node Lab</button>
      <button className="icon-text-button" onClick={() => void save()} disabled={!dirty}><Save size={15} />Save</button>
      <button className={'publish-toggle ' + (published ? 'active' : '')} onClick={() => void setPublished(!published)} disabled={runtime.sessionId === undefined}><span />{published ? 'Published' : 'Publish'}</button>
      <button className={'run-action ' + (running ? 'stopping' : '')} onClick={() => void (running ? cancelRun() : run())} disabled={!running && runtime.sessionId === undefined}>
        {running ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}{running ? 'Stop' : 'Execute workflow'}
      </button>
    </div>
  </header>
}

function CanvasEditor() {
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const onNodesChange = useFlowStore(state => state.onNodesChange)
  const onEdgesChange = useFlowStore(state => state.onEdgesChange)
  const onConnect = useFlowStore(state => state.onConnect)
  const selectNode = useFlowStore(state => state.selectNode)
  const addNode = useFlowStore(state => state.addNode)
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow()
  const [creator, setCreator] = useState<CreatorRequest>()
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const validConnection: IsValidConnection = connection => {
    const source = nodes.find(node => node.id === connection.source)
    const target = nodes.find(node => node.id === connection.target)
    const output = source?.data.outputs.find(port => port.id === connection.sourceHandle)
    const input = target?.data.inputs.find(port => port.id === connection.targetHandle)
    return output !== undefined && input !== undefined && compatible(output.type, input.type)
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
  const choose = (type: string): void => {
    if (creator === undefined) return
    const descriptor = nodeCatalog.find(item => item.type === type)
    if (descriptor === undefined) return
    const id = addNode(descriptor, { x: creator.flowX, y: creator.flowY })
    if (creator.direction === 'source' && creator.nodeId !== undefined) {
      const target = (descriptor.inputs ?? []).find(port => creator.portType !== undefined && compatible(creator.portType, port.type)) ?? descriptor.inputs?.[0]
      if (target !== undefined) onConnect({ source: creator.nodeId, sourceHandle: creator.handleId ?? null, target: id, targetHandle: target.id })
    } else if (creator.direction === 'target' && creator.nodeId !== undefined) {
      const source = (descriptor.outputs ?? []).find(port => creator.portType !== undefined && compatible(port.type, creator.portType)) ?? descriptor.outputs?.[0]
      if (source !== undefined) onConnect({ source: id, sourceHandle: source.id, target: creator.nodeId, targetHandle: creator.handleId ?? null })
    }
    setCreator(undefined)
    setInspectorOpen(true)
  }
  return <div className="editor-workspace">
    <main className="canvas-column" onContextMenu={event => event.preventDefault()}>
      <div className="canvas-toolbar">
        <button className="add-node-button" onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          const flow = screenToFlowPosition({ x: rect.left, y: rect.bottom + 8 })
          setCreator({ clientX: rect.left, clientY: rect.bottom + 8, flowX: flow.x, flowY: flow.y })
        }}><Plus size={16} />Add node</button>
        <span className="selection-help">Drag to select - Space + drag to pan - Right-click to add</span>
        <div className="canvas-tools"><button onClick={() => zoomOut()} aria-label="Zoom out">-</button><button onClick={() => fitView({ duration: 220, padding: .22 })} aria-label="Fit view"><Focus size={15} /></button><button onClick={() => zoomIn()} aria-label="Zoom in">+</button></div>
      </div>
      <ReactFlow
        className="flow-canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={connectionEnd}
        onSelectionChange={({ nodes: selected }) => selectNode(selected.length === 1 ? selected[0]?.id : undefined)}
        onNodeDoubleClick={(_event, node) => { if (node.data.executionRecord !== undefined) openNodeDetails(node.id) }}
        onNodeClick={() => setInspectorOpen(true)}
        onPaneClick={() => { selectNode(); setCreator(undefined) }}
        onPaneContextMenu={event => {
          event.preventDefault()
          const flow = screenToFlowPosition({ x: event.clientX, y: event.clientY })
          setCreator({ clientX: event.clientX, clientY: event.clientY, flowX: flow.x, flowY: flow.y })
        }}
        isValidConnection={validConnection}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        fitView
        fitViewOptions={{ padding: .23, maxZoom: 1.1 }}
        minZoom={.3}
        maxZoom={1.8}
        snapToGrid
        snapGrid={[16, 16]}
        connectionRadius={36}
        connectionLineStyle={{ stroke: 'var(--dsw-alias-state-business-primary, #4a5fa8)', strokeWidth: 2 }}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: 'var(--dsw-alias-border-strong, #7182aa)', strokeWidth: 1.7 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#d7d9de" />
        <MiniMap pannable zoomable nodeColor={node => String(node.data.color ?? '#8b8f99')} maskColor="rgba(245,246,248,.72)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <ExecutionDock />
      {creator !== undefined && <NodeCreator request={creator} onClose={() => setCreator(undefined)} onChoose={choose} />}
    </main>
    <div className={'inspector-wrap ' + (inspectorOpen ? '' : 'closed')}><PropertyInspector hidden={!inspectorOpen} onClose={() => setInspectorOpen(false)} /></div>
  </div>
}

function Editor() {
  const save = useFlowStore(state => state.save)
  const run = useFlowStore(state => state.run)
  const cancel = useFlowStore(state => state.cancelRun)
  const running = useFlowStore(state => state.running)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save() }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void (running ? cancel() : run()) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, run, running, save])
  return <><EditorHeader /><ReactFlowProvider><CanvasEditor /></ReactFlowProvider></>
}

function Shell({ onClose }: { onClose?: (() => void) | undefined }) {
  const view = useFlowStore(state => state.view)
  const runtime = useFlowRuntime()
  const refresh = useFlowStore(state => state.refreshWorkspace)
  useEffect(() => { if (runtime.sessionId !== undefined) void refresh() }, [refresh, runtime.sessionId])
  return <div className="dsh-runflow-root"><style>{FLOW_STYLES + FLOW_REDESIGN_STYLES + RUNFLOW_SIDEBAR_STYLES + CODE_EDITOR_STYLES}</style><div className="flow-app"><WorkflowSidebar onClose={onClose} /><div className="runflow-main">
    <div className="host-strip"><span className={runtime.sessionId === undefined ? 'offline' : ''}><Zap size={13} />{runtime.sessionId === undefined ? runtime.reason ?? 'Host disconnected' : 'DSH Host connected'}</span></div>
    {view === 'workflows' && <WorkflowsPage />}
    {view === 'executions' && <ExecutionsPage />}
    {view === 'editor' && <Editor />}
  </div><NodeDetailsDialog /><SourceWorkbench /></div></div>
}

export function FlowApp({ onClose }: { onClose?: (() => void) | undefined }) { return <Shell onClose={onClose} /> }

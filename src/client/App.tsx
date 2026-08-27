import { useEffect, useMemo, useState, type DragEvent } from 'react'
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  useReactFlow, type NodeTypes,
} from '@xyflow/react'
import {
  Braces, Check, ChevronRight, Code2, Download, Focus, PanelLeft,
  PanelRight, Play, Save, Sparkles, X,
} from 'lucide-react'
import { NODE_CATALOG } from './catalog.tsx'
import { ExecutionDock } from './ExecutionDock.tsx'
import { NodePalette, PropertyInspector } from './Panels.tsx'
import { FLOW_STYLES } from './styles.ts'
import { useFlowStore } from './store.ts'
import { WorkflowNode } from './WorkflowNode.tsx'

const nodeTypes: NodeTypes = { workflow: WorkflowNode }

function downloadJson(): void {
  const definition = useFlowStore.getState().definition()
  const blob = new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = `${definition.id}.json`
  anchor.click()
  URL.revokeObjectURL(href)
}

function Header({ onClose, onTogglePalette, onToggleInspector }: {
  onClose?: (() => void) | undefined
  onTogglePalette(): void
  onToggleInspector(): void
}) {
  const name = useFlowStore(state => state.workflowName)
  const setName = useFlowStore(state => state.setWorkflowName)
  const version = useFlowStore(state => state.version)
  const dirty = useFlowStore(state => state.dirty)
  const savedAt = useFlowStore(state => state.savedAt)
  const running = useFlowStore(state => state.running)
  const save = useFlowStore(state => state.save)
  const run = useFlowStore(state => state.run)
  return (
    <header className="flow-topbar">
      <div className="flow-brand"><span className="flow-logo"><Sparkles size={18} /></span><span className="flow-brand-copy"><strong>dsh-flow</strong><span>Agent workflow</span></span></div>
      <button type="button" className="icon-button mobile-only" onClick={onTogglePalette} aria-label="打开节点库"><PanelLeft size={17} /></button>
      <div className="flow-title-area">
        <input className="flow-name-input" value={name} onChange={event => setName(event.target.value)} aria-label="Workflow 名称" />
        <span className="flow-version">v{version}</span>
        <span className={`save-state ${dirty ? 'dirty' : ''}`}>{dirty ? '有未保存修改' : savedAt === undefined ? '已同步' : '刚刚保存'}</span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="icon-button mobile-only" onClick={onToggleInspector} aria-label="打开属性面板"><PanelRight size={17} /></button>
        <button type="button" className="secondary-button" onClick={downloadJson} aria-label="导出 Workflow JSON"><Download size={15} /><span>Export</span></button>
        <button type="button" className="secondary-button" onClick={save} aria-label="保存 Workflow"><Save size={15} /><span>Save</span></button>
        <button type="button" className="run-button" onClick={() => void run()} disabled={running} aria-label={running ? '正在运行 Workflow' : '运行 Workflow'}>{running ? <Braces size={16} className="flow-spin" /> : <Play size={15} fill="currentColor" />}<span>{running ? 'Running' : 'Run workflow'}</span></button>
        {onClose !== undefined && <button type="button" className="icon-button" onClick={onClose} aria-label="关闭 dsh-flow"><X size={17} /></button>}
      </div>
    </header>
  )
}

function Canvas() {
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const onNodesChange = useFlowStore(state => state.onNodesChange)
  const onEdgesChange = useFlowStore(state => state.onEdgesChange)
  const onConnect = useFlowStore(state => state.onConnect)
  const selectNode = useFlowStore(state => state.selectNode)
  const addNode = useFlowStore(state => state.addNode)
  const { fitView, screenToFlowPosition, zoomIn, zoomOut } = useReactFlow()

  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    const type = event.dataTransfer.getData('application/dsh-flow-node')
    const descriptor = NODE_CATALOG.find(item => item.type === type)
    if (descriptor === undefined) return
    addNode(descriptor, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
  }
  return (
    <main id="workflow-canvas" className="canvas-column" aria-label="Workflow 画布" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
      <div className="canvas-toolbar">
        <div className="crumb"><Code2 size={14} color="#4ade80" /><span>Workflows</span><ChevronRight size={13} color="#64748b" /><span>PR Review Pipeline</span></div>
        <div className="canvas-tools" aria-label="画布工具">
          <button type="button" onClick={() => zoomOut()} aria-label="缩小">−</button>
          <button type="button" onClick={() => fitView({ duration: 260, padding: .24 })} aria-label="适应画布"><Focus size={15} /></button>
          <button type="button" onClick={() => zoomIn()} aria-label="放大">+</button>
        </div>
      </div>
      <ReactFlow
        className="flow-canvas"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_event, node) => selectNode(node.id)}
        onPaneClick={() => selectNode()}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: .23, maxZoom: 1.1 }}
        minZoom={.35}
        maxZoom={1.7}
        snapToGrid
        snapGrid={[16, 16]}
        connectionLineStyle={{ stroke: '#4ade80', strokeWidth: 1.8 }}
        defaultEdgeOptions={{ type: 'smoothstep', style: { stroke: '#64748b', strokeWidth: 1.6 } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1.1} color="#263248" />
        <MiniMap pannable zoomable nodeColor={node => String(node.data.color ?? '#64748b')} maskColor="rgba(2,6,23,.55)" />
        <Controls showInteractive={false} />
      </ReactFlow>
      <div className="canvas-hint"><kbd>Space</kbd><span>拖动画布</span><kbd>⌘ S</kbd><span>保存</span></div>
      <ExecutionDock />
    </main>
  )
}

function Editor({ onClose }: { onClose?: (() => void) | undefined }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth > 900)
  const save = useFlowStore(state => state.save)
  const run = useFlowStore(state => state.run)
  useEffect(() => {
    const handleResize = (): void => {
      if (window.innerWidth <= 900) { setPaletteOpen(false); setInspectorOpen(false) }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); save() }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run() }
      if (event.key === 'Escape' && onClose !== undefined) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, run, save])
  return (
    <div className="dsh-flow-root">
      <style>{FLOW_STYLES}</style>
      <a className="flow-skip" href="#workflow-canvas">跳到工作流画布</a>
      <div className="flow-app">
        <Header onClose={onClose} onTogglePalette={() => setPaletteOpen(value => !value)} onToggleInspector={() => setInspectorOpen(value => !value)} />
        <div className="flow-workspace">
          <NodePalette hidden={!paletteOpen} />
          <Canvas />
          <PropertyInspector hidden={!inspectorOpen} />
        </div>
      </div>
    </div>
  )
}

export function FlowApp({ onClose }: { onClose?: (() => void) | undefined }) {
  const providerKey = useMemo(() => 'dsh-flow-provider', [])
  return <ReactFlowProvider key={providerKey}><Editor onClose={onClose} /></ReactFlowProvider>
}

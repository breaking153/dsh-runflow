import { useState } from 'react'
import { Plus, Save, Workflow, X } from 'lucide-react'
import { useFlowStore } from './store.ts'

export function WorkflowTabs() {
  const workflows = useFlowStore(state => state.workflows)
  const openIds = useFlowStore(state => state.openWorkflowIds)
  const activeId = useFlowStore(state => state.workflowId)
  const dirty = useFlowStore(state => state.dirty)
  const open = useFlowStore(state => state.openWorkflow)
  const close = useFlowStore(state => state.closeWorkflowTab)
  const reorder = useFlowStore(state => state.reorderWorkflowTabs)
  const create = useFlowStore(state => state.createWorkflow)
  const save = useFlowStore(state => state.save)
  const [dragging, setDragging] = useState<string>()
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>()
  const tabs = openIds.flatMap(id => workflows.find(workflow => workflow.id === id) ?? [])
  return <div className="workflow-tabs-bar" onContextMenu={event => event.preventDefault()}>
    <div className="workflow-tabs-scroll" role="tablist" aria-label="Open workflows">
      {tabs.map(workflow => <div key={workflow.id} className={'workflow-tab ' + (workflow.id === activeId ? 'active ' : '') + (dragging === workflow.id ? 'dragging' : '')} role="tab" aria-selected={workflow.id === activeId} draggable onDragStart={() => setDragging(workflow.id)} onDragEnd={() => setDragging(undefined)} onDragOver={event => event.preventDefault()} onDrop={() => { if (dragging !== undefined) reorder(dragging, workflow.id) }} onContextMenu={event => { event.preventDefault(); setMenu({ id: workflow.id, x: event.clientX, y: event.clientY }) }}>
        <button className="workflow-tab-main" onClick={() => open(workflow.id)}><Workflow size={13} /><span>{workflow.name}</span>{workflow.id === activeId && dirty && <em aria-label="Unsaved changes">•</em>}</button>
        <button className="workflow-tab-close" onClick={() => void close(workflow.id)} aria-label={`Close ${workflow.name}`}><X size={12} /></button>
      </div>)}
    </div>
    <button className="workflow-tab-new" onClick={create} aria-label="New workflow" title="New workflow"><Plus size={14} /></button>
    {menu !== undefined && <>
      <button className="canvas-menu-scrim tab-menu-scrim" onClick={() => setMenu(undefined)} aria-label="Close tab menu" />
      <div className="workflow-tab-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
        <button role="menuitem" onClick={() => { if (menu.id !== activeId) open(menu.id); void save(); setMenu(undefined) }}><Save size={13} />Save</button>
        <button role="menuitem" onClick={() => { void close(menu.id); setMenu(undefined) }}><X size={13} />Close tab</button>
      </div>
    </>}
  </div>
}

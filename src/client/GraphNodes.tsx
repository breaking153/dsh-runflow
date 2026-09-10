import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { Box, Group, Route } from 'lucide-react'
import type { FlowNode } from './store.ts'
import { useFlowStore } from './store.ts'
import { PortRow } from './WorkflowNode.tsx'

export function WorkflowGroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const begin = useFlowStore(state => state.beginGraphGesture)
  const end = useFlowStore(state => state.endGraphGesture)
  return <div className={'workflow-group-node ' + (selected ? 'selected' : '')}>
    <NodeResizer minWidth={240} minHeight={180} isVisible={selected} lineClassName="group-resize-line" handleClassName="group-resize-handle" onResizeStart={begin} onResizeEnd={end} />
    <div className="workflow-group-title"><Group size={14} /><strong>{data.label}</strong><span>{data.memberNodeIds?.length ?? 0} nodes</span></div>
    <span className="workflow-group-id">{id}</span>
  </div>
}

export function RerouteNode({ selected }: NodeProps<FlowNode>) {
  return <div className={'reroute-node ' + (selected ? 'selected' : '')} title="Reroute point">
    <Handle id="input" type="target" position={Position.Left} isConnectable />
    <Route size={10} />
    <Handle id="output" type="source" position={Position.Right} isConnectable />
  </div>
}

export function SubflowNode({ id, data, selected }: NodeProps<FlowNode>) {
  return <div className={'subflow-node workflow-node ' + (selected ? 'selected is-selected' : '')}>
    <header><span><Box size={15} /></span><div><strong>{data.label}</strong><small>Executable subflow</small></div></header>
    <div className="node-port-grid">
      <div className="port-column input-column">{data.inputs.map(port => <PortRow key={port.id} nodeId={id} port={port} direction="input" value={undefined} />)}</div>
      <div className="port-column output-column">{data.outputs.map(port => <PortRow key={port.id} nodeId={id} port={port} direction="output" value={undefined} />)}</div>
    </div>
    <footer>Double-click to open</footer>
  </div>
}

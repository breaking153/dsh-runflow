import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { Box, Group, Route } from 'lucide-react'
import type { FlowNode } from './store.ts'
import { useFlowStore } from './store.ts'

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

export function SubflowNode({ data, selected }: NodeProps<FlowNode>) {
  return <div className={'subflow-node ' + (selected ? 'selected' : '')}>
    <header><span><Box size={15} /></span><div><strong>{data.label}</strong><small>Executable subflow</small></div></header>
    <div className="subflow-ports">
      <div>{data.inputs.map(port => <div className="subflow-port input" key={port.id}><Handle id={port.id} type="target" position={Position.Left} /><span>{port.label ?? port.id}</span><em>{port.type}</em></div>)}</div>
      <div>{data.outputs.map(port => <div className="subflow-port output" key={port.id}><span>{port.label ?? port.id}</span><em>{port.type}</em><Handle id={port.id} type="source" position={Position.Right} /></div>)}</div>
    </div>
    <footer>Double-click to open</footer>
  </div>
}

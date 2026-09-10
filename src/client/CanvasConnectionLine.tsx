import { useEffect, useMemo } from 'react'
import { getBezierPath, type ConnectionLineComponentProps } from '@xyflow/react'
import { validateDraggedConnection, type ConnectionValidation } from './connection-planning.ts'
import { PORT_COLORS } from './port-presentation.ts'
import { useFlowStore, type FlowNode } from './store.ts'

export function CanvasConnectionLine(props: ConnectionLineComponentProps<FlowNode> & { onFeedback?(result: ConnectionValidation | undefined): void }) {
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const mode = useFlowStore(state => state.workflowExecution?.mode ?? 'dag')
  const { fromNode, fromHandle, toNode, toHandle, onFeedback } = props
  const result = useMemo<ConnectionValidation | undefined>(() => {
    if (toNode === null || toHandle === null) return undefined
    return validateDraggedConnection(nodes, { nodeId: fromNode.id, handleId: fromHandle.id ?? null, type: fromHandle.type }, { nodeId: toNode.id, handleId: toHandle.id ?? null, type: toHandle.type }, { mode, edges })
  }, [nodes, edges, mode, fromNode.id, fromHandle.id, fromHandle.type, toNode?.id, toHandle?.id, toHandle?.type])
  useEffect(() => { onFeedback?.(result) }, [result, onFeedback])
  const sourcePort = (fromHandle.type === 'source' ? fromNode.data.outputs : fromNode.data.inputs).find(port => port.id === fromHandle.id)
  const invalid = props.connectionStatus === 'invalid' || result?.ok === false
  const color = invalid ? '#f06a75' : PORT_COLORS[result?.sourceType ?? sourcePort?.type ?? 'any']
  const [path] = getBezierPath({ sourceX: props.fromX, sourceY: props.fromY, targetX: props.toX, targetY: props.toY, sourcePosition: props.fromPosition, targetPosition: props.toPosition })
  return <g className={invalid ? 'canvas-connection is-invalid' : 'canvas-connection is-valid'}><path className="react-flow__connection-path" d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" /><circle cx={props.toX} cy={props.toY} r={3.5} fill={color} /></g>
}

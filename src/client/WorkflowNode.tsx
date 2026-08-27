import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, CircleAlert, LoaderCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { FlowNode } from './store.ts'
import { NodeIcon } from './catalog.tsx'

const statusCopy = {
  WAITING: 'Ready', RUNNING: 'Running', SUCCESS: 'Success',
  FAILED: 'Failed', SKIPPED: 'Skipped', CANCELLED: 'Cancelled',
} as const

function StatusIcon({ status }: { status: FlowNode['data']['status'] }) {
  if (status === 'RUNNING') return <LoaderCircle size={13} className="flow-spin" />
  if (status === 'SUCCESS') return <Check size={13} />
  if (status === 'FAILED') return <CircleAlert size={13} />
  return <span className="node-status-dot" />
}

export function WorkflowNode({ data, selected }: NodeProps<FlowNode>) {
  const isTrigger = data.nodeType.startsWith('trigger.')
  return (
    <article className={`workflow-node ${selected ? 'is-selected' : ''}`} style={{ '--node-color': data.color } as CSSProperties}>
      {!isTrigger && <Handle type="target" position={Position.Left} aria-label="输入端口" />}
      <div className="node-accent" />
      <div className="node-header">
        <span className="node-icon"><NodeIcon name={data.icon} size={18} /></span>
        <span className={`node-status status-${data.status.toLowerCase()}`}>
          <StatusIcon status={data.status} />{statusCopy[data.status]}
        </span>
      </div>
      <strong>{data.label}</strong>
      <span className="node-type">{data.nodeType}</span>
      <div className="node-footer"><span>1 input</span><span>1 output</span></div>
      <Handle type="source" position={Position.Right} aria-label="输出端口" />
    </article>
  )
}

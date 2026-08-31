import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, CircleAlert, Expand, LoaderCircle } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
import type { JsonValue, WorkflowPortDescriptor } from '../contracts.ts'
import type { FlowNode } from './store.ts'
import { useFlowStore } from './store.ts'
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

function previewText(value: JsonValue | undefined): string {
  if (value === undefined) return '尚无执行数据'
  const rendered = JSON.stringify(value)
  return rendered.length <= 150 ? rendered : rendered.slice(0, 149) + '…'
}

function PortRow({ nodeId, port, direction, value }: {
  nodeId: string
  port: WorkflowPortDescriptor
  direction: 'input' | 'output'
  value: JsonValue | undefined
}) {
  const [preview, setPreview] = useState(false)
  const timer = useRef<number>()
  const openDetails = useFlowStore(state => state.openNodeDetails)
  const startPreview = (): void => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPreview(true), 500)
  }
  const stopPreview = (): void => {
    window.clearTimeout(timer.current)
    setPreview(false)
  }
  const target = direction === 'input'
  return (
    <div className={'port-row port-' + direction} onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <Handle
        id={port.id}
        type={target ? 'target' : 'source'}
        position={target ? Position.Left : Position.Right}
        aria-label={(target ? '输入引脚 ' : '输出引脚 ') + port.id + ' · ' + port.type}
      />
      <button
        type="button"
        className="port-button nodrag nopan"
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        onClick={event => {
          event.stopPropagation()
          openDetails(nodeId, port.id)
        }}
        aria-label={'查看 ' + port.id + ' 引脚数据'}
      >
        <span>{port.label ?? port.id}</span>
        <em>{port.type}</em>
      </button>
      {preview && (
        <div className={'port-preview ' + (target ? 'preview-left' : 'preview-right')} role="tooltip">
          <header><span>{port.label ?? port.id}</span><em>{port.type}</em></header>
          <code>{previewText(value)}</code>
          <span>点击展开完整结果</span>
        </div>
      )}
    </div>
  )
}

export function WorkflowNode({ id, data, selected }: NodeProps<FlowNode>) {
  const openDetails = useFlowStore(state => state.openNodeDetails)
  const record = data.executionRecord
  return (
    <article className={'workflow-node ' + (selected ? 'is-selected' : '')} style={{ '--node-color': data.color } as CSSProperties}>
      <div className="node-accent" />
      <div className="node-header">
        <span className="node-icon"><NodeIcon name={data.icon} size={18} /></span>
        <span className={'node-status status-' + data.status.toLowerCase()}>
          <StatusIcon status={data.status} />{statusCopy[data.status]}
        </span>
      </div>
      <strong>{data.label}</strong>
      <span className="node-type">{data.nodeType}</span>
      <div className="node-port-grid">
        <div className="port-column input-column">
          {data.inputs.map(port => (
            <PortRow key={port.id} nodeId={id} port={port} direction="input" value={record?.inputPorts?.[port.id]} />
          ))}
        </div>
        <div className="port-column output-column">
          {data.outputs.map(port => (
            <PortRow key={port.id} nodeId={id} port={port} direction="output" value={record?.outputPorts?.[port.id]} />
          ))}
        </div>
      </div>
      <div className="node-footer">
        <span>{data.inputs.length + data.outputs.length} typed ports</span>
        <button
          type="button"
          className="node-details-button nodrag nopan"
          disabled={record === undefined}
          onClick={event => {
            event.stopPropagation()
            openDetails(id)
          }}
          aria-label={'查看 ' + data.label + ' 执行详情'}
        >
          <Expand size={11} />详情
        </button>
      </div>
    </article>
  )
}
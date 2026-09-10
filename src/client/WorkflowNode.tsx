import { Handle, Position, useConnection, useNodeConnections, type NodeProps } from '@xyflow/react'
import { Check, CircleAlert, Expand, LoaderCircle, Pause } from 'lucide-react'
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { JsonValue, WorkflowPortDescriptor } from '../contracts.ts'
import type { FlowNode } from './store.ts'
import { useFlowStore } from './store.ts'
import { NodeIcon } from './catalog.tsx'
import { useRunFlowLocale, type RunFlowLocaleKey } from './locale.ts'
import { PORT_COLORS } from './port-presentation.ts'

const statusCopy: Record<FlowNode['data']['status'], RunFlowLocaleKey> = {
  WAITING: 'ready', RUNNING: 'running', SUCCESS: 'success',
  FAILED: 'failed', SKIPPED: 'skipped', CANCELLED: 'cancelled', PAUSED: 'paused',
} as const

function StatusIcon({ status }: { status: FlowNode['data']['status'] }) {
  if (status === 'RUNNING') return <LoaderCircle size={13} className="flow-spin" />
  if (status === 'PAUSED') return <Pause size={13} />
  if (status === 'SUCCESS') return <Check size={13} />
  if (status === 'FAILED') return <CircleAlert size={13} />
  return <span className="node-status-dot" />
}

function previewText(value: JsonValue | undefined, empty: string): string {
  if (value === undefined) return empty
  const rendered = JSON.stringify(value)
  return rendered.length <= 150 ? rendered : rendered.slice(0, 149) + '…'
}

export const PortRow = memo(function PortRow({ nodeId, port, direction, value }: {
  nodeId: string
  port: WorkflowPortDescriptor
  direction: 'input' | 'output'
  value: JsonValue | undefined
}) {
  const { language, t } = useRunFlowLocale()
  const [preview, setPreview] = useState(false)
  const timer = useRef<number>()
  const connecting = useConnection(connection => connection.inProgress)
  const connections = useNodeConnections({ id: nodeId, handleType: direction === 'input' ? 'target' : 'source', handleId: port.id })
  const openDetails = useFlowStore(state => state.openNodeDetails)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  useEffect(() => {
    if (connecting) { window.clearTimeout(timer.current); setPreview(false) }
  }, [connecting])
  const startPreview = (): void => {
    if (connecting) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPreview(true), 500)
  }
  const stopPreview = (): void => {
    window.clearTimeout(timer.current)
    setPreview(false)
  }
  const target = direction === 'input'
  return (
    <div className={'port-row port-' + direction + ' port-type-' + port.type} style={{ '--port-color': PORT_COLORS[port.type] } as CSSProperties} onMouseEnter={startPreview} onMouseLeave={stopPreview}>
      <Handle
        className={(port.type === 'flow' ? 'flow-pin' : 'data-pin') + (connections.length > 0 ? ' connected' : '')}
        id={port.id}
        type={target ? 'target' : 'source'}
        position={target ? Position.Left : Position.Right}
        aria-label={(target ? t('input') : t('outputs')) + ' ' + port.id + ' · ' + port.type}
      >{port.type === 'flow' && <span className="pin-core" aria-hidden="true" />}</Handle>
      <button
        type="button"
        className="port-button nodrag nopan"
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        onClick={event => {
          event.stopPropagation()
          openDetails(nodeId, port.id)
        }}
        aria-label={(language === 'zh' ? '查看引脚数据 ' : 'Inspect port data ') + port.id}
      >
        <span>{port.label ?? port.id}</span>
        {(port.label ?? port.id) !== port.type && <em>{port.type}</em>}
      </button>
      {preview && !connecting && (
        <div className={'port-preview ' + (target ? 'preview-left' : 'preview-right')} role="tooltip">
          <header><span>{port.label ?? port.id}</span><em>{port.type}</em></header>
          <code>{previewText(value, t('noOutput'))}</code>
          <span>{t('outputAvailable')}</span>
        </div>
      )}
    </div>
  )
})

export const WorkflowNode = memo(function WorkflowNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { t } = useRunFlowLocale()
  const openDetails = useFlowStore(state => state.openNodeDetails)
  const record = data.executionRecord
  const executionFirst = (a: WorkflowPortDescriptor, b: WorkflowPortDescriptor) => Number(b.type === 'flow') - Number(a.type === 'flow')
  return (
    <article className={'workflow-node ' + (selected ? 'is-selected' : '')} style={{ '--node-color': data.color } as CSSProperties}>
      <div className="node-header">
        <span className="node-icon"><NodeIcon name={data.icon} size={18} /></span>
        <span className="node-heading"><strong title={data.label}>{data.label}</strong><span className="node-type" title={data.nodeType}>{data.nodeType}</span></span>
        <span className={'node-status status-' + data.status.toLowerCase()} title={t(statusCopy[data.status])} aria-label={t(statusCopy[data.status])}>
          <StatusIcon status={data.status} />{data.status !== 'WAITING' && t(statusCopy[data.status])}
        </span>
      </div>
      <div className="node-port-grid">
        <div className="port-column input-column">
          {[...data.inputs].sort(executionFirst).map(port => (
            <PortRow key={port.id} nodeId={id} port={port} direction="input" value={record?.inputPorts?.[port.id]} />
          ))}
        </div>
        <div className="port-column output-column">
          {[...data.outputs].sort(executionFirst).map(port => (
            <PortRow key={port.id} nodeId={id} port={port} direction="output" value={record?.outputPorts?.[port.id]} />
          ))}
        </div>
      </div>
      {record !== undefined && <div className="node-footer">
        <button
          type="button"
          className="node-details-button nodrag nopan"
          onClick={event => {
            event.stopPropagation()
            openDetails(id)
          }}
          aria-label={t('output') + ' · ' + data.label}
        >
          <Expand size={11} />{t('output')}
        </button>
      </div>}
    </article>
  )
})

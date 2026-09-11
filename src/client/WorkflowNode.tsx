import { Handle, Position, useConnection, useNodeConnections, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { Check, CircleAlert, Expand, LoaderCircle, Pause } from 'lucide-react'
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import type { JsonValue } from '../contracts.ts'
import type { FlowNode } from './store.ts'
import { useFlowStore } from './store.ts'
import { NodeIcon } from './catalog.tsx'
import { useRunFlowLocale, type RunFlowLocaleKey } from './locale.ts'
import { PORT_COLORS } from './port-presentation.ts'
import type { EditorPortDescriptor } from './property-ports.ts'
import { pinAtElement } from './pin-connections.ts'

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
  port: EditorPortDescriptor
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
    <div className={'port-row port-' + direction + ' port-type-' + port.type} style={{ '--port-color': PORT_COLORS[port.type] } as CSSProperties} onMouseEnter={startPreview} onMouseLeave={stopPreview} onClick={event => { if (pinAtElement(event.target) !== undefined) event.stopPropagation() }}>
      <Handle
        className={(port.type === 'flow' ? 'flow-pin' : 'data-pin') + (connections.length > 0 ? ' connected' : '')}
        id={port.id}
        type={target ? 'target' : 'source'}
        position={target ? Position.Left : Position.Right}
        aria-label={(target ? t('input') : t('outputs')) + ' ' + port.id + ' · ' + port.type}
        tabIndex={0}
        aria-keyshortcuts="Delete Backspace"
        title={language === 'zh' ? '拖动连接；Delete 或右键断开此引脚的连接' : 'Drag to connect; Delete or right-click to disconnect this pin'}
        onMouseDown={event => { if (event.button === 0) event.currentTarget.focus({ preventScroll: true }) }}
        isConnectable={port.unavailable !== true}
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
        <span>{port.unavailable && <CircleAlert size={11} aria-label={t('propertyPinUnavailable')} />}{port.label ?? port.id}</span>
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
  const updateNodeInternals = useUpdateNodeInternals()
  const kind = data.executionKind ?? 'effect'
  const portSignature = JSON.stringify([kind, data.inputs.map(port => [port.id, port.type]), data.outputs.map(port => [port.id, port.type])])
  useEffect(() => { updateNodeInternals(id) }, [id, portSignature, updateNodeInternals])
  const kindLabel = t(kind === 'trigger' ? 'triggerNode' : kind === 'pure' ? 'pureNode' : 'actionNode')
  const kindHint = t(kind === 'trigger' ? 'triggerNodeHint' : kind === 'pure' ? 'pureNodeHint' : 'actionNodeHint')
  const constantValue = data.config.value === undefined ? data.valueDefault : data.config.value
  return (
    <article className={'workflow-node node-kind-' + kind + ' ' + (selected ? 'is-selected' : '')} style={{ '--node-color': data.color } as CSSProperties}>
      <div className="node-header">
        <span className="node-icon"><NodeIcon name={data.icon} size={18} /></span>
        <span className="node-heading"><strong title={data.label}>{data.label}</strong><span className="node-meta"><span className="node-kind" title={kindHint}>{kindLabel}</span><span className="node-type" title={data.nodeType}>{data.nodeType}</span></span></span>
        <span className={'node-status status-' + data.status.toLowerCase()} title={t(statusCopy[data.status])} aria-label={t(statusCopy[data.status])}>
          <StatusIcon status={data.status} />{data.status !== 'WAITING' && t(statusCopy[data.status])}
        </span>
      </div>
      {data.nodeType.startsWith('value.') && <code className="node-value-preview" title={previewText(constantValue, '')}>{data.promotedInputs?.includes('value') && <span>{t('fallbackValue')} · </span>}{previewText(constantValue, '—')}</code>}
      {(['execution', 'data'] as const).map(lane => {
        const inLane = (port: EditorPortDescriptor) => (port.type === 'flow') === (lane === 'execution')
        const inputs = data.inputs.filter(inLane)
        const outputs = data.outputs.filter(inLane)
        if (inputs.length + outputs.length === 0) return null
        return <div key={lane} className="node-port-grid" data-lane={lane} aria-label={t(lane === 'execution' ? 'executionPins' : 'dataPins')}>
          <div className="port-column input-column">
            {inputs.map(port => <PortRow key={port.id} nodeId={id} port={port} direction="input" value={record?.inputPorts?.[port.id]} />)}
          </div>
          <div className="port-column output-column">
            {outputs.map(port => <PortRow key={port.id} nodeId={id} port={port} direction="output" value={record?.outputPorts?.[port.id]} />)}
          </div>
        </div>
      })}
      {record !== undefined && <div className="node-footer">
        {record.callId !== undefined && (record.iteration ?? 0) > 1 && <span className="node-visit-count">{t('nodeVisits', { count: record.iteration! })}</span>}
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

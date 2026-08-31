import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle, Check, Clipboard, Clock3, FileJson, FolderOpen,
  ArrowDownToLine, ArrowUpFromLine, Logs, Network, X,
} from 'lucide-react'
import type { JsonValue, NodeExecutionRecord } from '../contracts.ts'
import { useFlowStore } from './store.ts'

type DetailsTab = 'summary' | 'input' | 'output' | 'logs' | 'files'

function JsonView({ value, empty = '暂无数据' }: { value: JsonValue | undefined; empty?: string }) {
  if (value === undefined) return <div className="details-empty">{empty}</div>
  return <pre className="details-json">{JSON.stringify(value, null, 2)}</pre>
}

function durationOf(record: NodeExecutionRecord): string {
  if (record.durationMs !== undefined) return record.durationMs + ' ms'
  if (record.startedAt === undefined) return '—'
  const end = record.finishedAt === undefined ? Date.now() : new Date(record.finishedAt).getTime()
  return Math.max(0, end - new Date(record.startedAt).getTime()) + ' ms'
}

export function NodeDetailsDialog() {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<DetailsTab>('summary')
  const detailsNodeId = useFlowStore(state => state.detailsNodeId)
  const detailsPortId = useFlowStore(state => state.detailsPortId)
  const selectedExecutionId = useFlowStore(state => state.selectedExecutionId)
  const execution = useFlowStore(state => state.executions.find(item => item.id === selectedExecutionId))
  const node = useFlowStore(state => state.nodes.find(item => item.id === detailsNodeId))
  const close = useFlowStore(state => state.closeNodeDetails)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const record = execution?.nodes.find(item => item.nodeId === detailsNodeId)

  useEffect(() => {
    if (detailsNodeId === undefined) return
    setTab(detailsPortId === undefined ? 'summary' : 'output')
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>('.details-close')?.focus())
  }, [detailsNodeId])
  useEffect(() => {
    if (detailsPortId === undefined || record === undefined) return
    setTab(Object.hasOwn(record.inputPorts ?? {}, detailsPortId) ? 'input' : 'output')
  }, [detailsPortId, record])

  const selectedPortValue = useMemo(() => {
    if (detailsPortId === undefined || record === undefined) return undefined
    return record.outputPorts?.[detailsPortId] ?? record.inputPorts?.[detailsPortId]
  }, [detailsPortId, record])

  if (detailsNodeId === undefined || node === undefined || record === undefined || execution === undefined) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])',
    )]
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const tabs: { id: DetailsTab; label: string; icon: typeof Network; count?: number }[] = [
    { id: 'summary', label: '概览', icon: Network },
    { id: 'input', label: '输入', icon: ArrowDownToLine, count: Object.keys(record.inputPorts ?? {}).length },
    { id: 'output', label: '输出', icon: ArrowUpFromLine, count: Object.keys(record.outputPorts ?? {}).length },
    { id: 'logs', label: '日志', icon: Logs, count: record.logs?.length ?? 0 },
    { id: 'files', label: '文件', icon: FolderOpen, count: record.artifacts?.length ?? 0 },
  ]

  return (
    <div className="details-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) close() }}>
      <div ref={dialogRef} className="node-details-dialog" role="dialog" aria-modal="true" aria-label={node.data.label + ' 执行详情'} onKeyDown={onKeyDown}>
        <header className="details-header">
          <div className="details-title">
            <span className={'details-status status-' + record.status.toLowerCase()}>{record.status}</span>
            <span><strong>{node.data.label}</strong><small>{node.data.nodeType} · {record.nodeId}</small></span>
          </div>
          <button type="button" className="details-close" onClick={close} aria-label="关闭节点执行详情"><X size={17} /></button>
        </header>

        <nav className="details-tabs" aria-label="节点执行详情分类">
          {tabs.map(item => {
            const Icon = item.icon
            return (
              <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)} aria-pressed={tab === item.id}>
                <Icon size={14} />{item.label}{item.count !== undefined && <span>{item.count}</span>}
              </button>
            )
          })}
        </nav>

        <div className="details-content">
          {detailsPortId !== undefined && selectedPortValue !== undefined && (
            <section className="selected-port-panel">
              <div>
                <span>引脚预览</span>
                <strong>{detailsPortId}</strong>
              </div>
              <button type="button" onClick={() => openNodeDetails(record.nodeId, undefined, execution.id)}>查看完整节点</button>
              <JsonView value={selectedPortValue} />
            </section>
          )}

          {tab === 'summary' && (
            <div className="details-summary">
              <section className="details-metrics">
                <article><Clock3 size={15} /><span>耗时<strong>{durationOf(record)}</strong></span></article>
                <article><Check size={15} /><span>尝试次数<strong>{record.attempts}</strong></span></article>
                <article><FileJson size={15} /><span>产物数量<strong>{record.artifacts?.length ?? 0}</strong></span></article>
              </section>
              {record.error !== undefined && <section className="details-error"><AlertTriangle size={17} /><span><strong>执行失败</strong>{record.error}</span></section>}
              <section className="details-section">
                <h3>执行位置</h3>
                <code>{execution.outputDir ?? 'Host 未返回输出目录'}</code>
              </section>
              <section className="details-section">
                <h3>输出摘要</h3>
                <JsonView value={record.output} />
              </section>
            </div>
          )}

          {tab === 'input' && (
            <section className="details-section">
              <h3>输入引脚</h3>
              <div className="details-port-list">
                {Object.entries(record.inputPorts ?? {}).map(([port, value]) => (
                  <button type="button" key={port} className={detailsPortId === port ? 'is-active' : ''} onClick={() => openNodeDetails(record.nodeId, port, execution.id)}>
                    <span>{port}</span><code>{JSON.stringify(value).slice(0, 90)}</code>
                  </button>
                ))}
              </div>
              <JsonView value={record.input} empty="该节点没有输入数据" />
            </section>
          )}

          {tab === 'output' && (
            <section className="details-section">
              <h3>输出引脚</h3>
              <div className="details-port-list">
                {Object.entries(record.outputPorts ?? {}).map(([port, value]) => (
                  <button type="button" key={port} className={detailsPortId === port ? 'is-active' : ''} onClick={() => openNodeDetails(record.nodeId, port, execution.id)}>
                    <span>{port}</span><code>{JSON.stringify(value).slice(0, 90)}</code>
                  </button>
                ))}
              </div>
              <JsonView value={record.output} empty="该节点尚未产生输出" />
            </section>
          )}

          {tab === 'logs' && (
            <section className="details-section">
              <h3>执行日志</h3>
              <div className="details-log-list">
                {(record.logs ?? []).map((entry, index) => (
                  <article key={entry.timestamp + '-' + index} className={'log-' + entry.level}>
                    <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                    <span>{entry.level}</span>
                    <p>{entry.message}</p>
                    {entry.data !== undefined && <code>{JSON.stringify(entry.data)}</code>}
                  </article>
                ))}
                {(record.logs?.length ?? 0) === 0 && <div className="details-empty">没有日志记录</div>}
              </div>
            </section>
          )}

          {tab === 'files' && (
            <section className="details-section">
              <h3>输出与调试文件</h3>
              <div className="artifact-list">
                {(record.artifacts ?? []).map(artifact => (
                  <article key={artifact.path}>
                    <span className={'artifact-kind kind-' + artifact.kind}>{artifact.kind}</span>
                    <div><strong>{artifact.label}</strong><code>{artifact.path}</code>{artifact.preview !== undefined && <small>{artifact.preview}</small>}</div>
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(artifact.path)} aria-label={'复制 ' + artifact.label + ' 路径'} title="复制路径"><Clipboard size={14} /></button>
                  </article>
                ))}
                {(record.artifacts?.length ?? 0) === 0 && <div className="details-empty">没有输出文件</div>}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
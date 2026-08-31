import { useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, LoaderCircle, TerminalSquare,
} from 'lucide-react'
import { useFlowStore } from './store.ts'

export function ExecutionDock() {
  const [open, setOpen] = useState(false)
  const execution = useFlowStore(state => state.executions[0])
  const running = useFlowStore(state => state.running)
  const runError = useFlowStore(state => state.runError)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  if (execution === undefined) {
    return runError === undefined ? null : (
      <section className="execution-dock execution-error" role="alert">
        <AlertTriangle size={14} /><span><strong>Host 执行未启动</strong>{runError}</span>
      </section>
    )
  }
  const duration = execution.startedAt === undefined ? 0 : Math.max(0,
    new Date(execution.finishedAt ?? Date.now()).getTime() - new Date(execution.startedAt).getTime())
  return (
    <section className="execution-dock" aria-label="最近执行" aria-live="polite">
      <button type="button" className="execution-summary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="runflow-execution-details">
        <span className="execution-icon">{running ? <LoaderCircle size={14} className="flow-spin" /> : <TerminalSquare size={14} />}</span>
        <span className="execution-copy">
          <strong>{running
            ? 'Host 正在执行'
            : execution.status === 'FAILED'
              ? '执行失败'
              : execution.status === 'CANCELLED' ? '执行已停止' : '执行完成'}</strong>
          <span>{execution.id.slice(0, 8)} · {execution.nodes.length} 个节点</span>
        </span>
        <span className="execution-duration">{(duration / 1000).toFixed(2)}s</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {runError !== undefined && <div className="execution-inline-error" role="alert"><AlertTriangle size={12} />{runError}</div>}
      {open && <div id="runflow-execution-details" className="execution-body">
        {execution.nodes.map(record => (
          <button
            type="button"
            className="execution-row"
            key={record.nodeId}
            onClick={() => openNodeDetails(record.nodeId, undefined, execution.id)}
            disabled={record.status === 'WAITING'}
            aria-label={'查看 ' + record.nodeId + ' 执行详情'}
          >
            {record.status === 'RUNNING'
              ? <LoaderCircle size={12} className="flow-spin" />
              : record.status === 'FAILED' ? <AlertTriangle size={12} /> : <Check size={12} />}
            <span>{record.nodeId}</span>
            <time>{record.status.toLowerCase()} · {record.durationMs ?? 0}ms</time>
          </button>
        ))}
        {execution.outputDir !== undefined && <div className="execution-output-dir"><span>Output</span><code>{execution.outputDir}</code></div>}
      </div>}
    </section>
  )
}
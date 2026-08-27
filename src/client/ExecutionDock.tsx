import { useState } from 'react'
import { Check, ChevronDown, ChevronUp, LoaderCircle, TerminalSquare } from 'lucide-react'
import { useFlowStore } from './store.ts'

export function ExecutionDock() {
  const [open, setOpen] = useState(false)
  const execution = useFlowStore(state => state.executions[0])
  const running = useFlowStore(state => state.running)
  if (execution === undefined) return null
  const duration = execution.startedAt === undefined ? 0 : Math.max(0,
    new Date(execution.finishedAt ?? Date.now()).getTime() - new Date(execution.startedAt).getTime())
  return (
    <section className="execution-dock" aria-label="最近执行">
      <button type="button" className="execution-summary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className="execution-icon">{running ? <LoaderCircle size={14} className="flow-spin" /> : <TerminalSquare size={14} />}</span>
        <span className="execution-copy"><strong>{running ? '正在执行 Workflow' : 'Execution 完成'}</strong><span>{execution.id.slice(0, 8)} · {execution.nodes.length} nodes</span></span>
        <span className="execution-duration">{(duration / 1000).toFixed(2)}s</span>
        {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
      </button>
      {open && <div className="execution-body">
        {execution.nodes.map(record => <div className="execution-row" key={record.nodeId}>
          {record.status === 'RUNNING' ? <LoaderCircle size={12} className="flow-spin" /> : <Check size={12} />}
          <span>{record.nodeId}</span><time>{record.status.toLowerCase()}</time>
        </div>)}
      </div>}
    </section>
  )
}

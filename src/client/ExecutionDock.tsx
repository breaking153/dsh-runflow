import { useMemo, useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, CircleX, Clock3, FileClock,
  LoaderCircle, Square, TerminalSquare,
} from 'lucide-react'
import type { WorkflowExecution } from '../contracts.ts'
import { useFlowStore } from './store.ts'

function elapsed(execution: WorkflowExecution): number {
  return execution.startedAt === undefined ? 0 : Math.max(0,
    new Date(execution.finishedAt ?? Date.now()).getTime() - new Date(execution.startedAt).getTime())
}

function ExecutionStatusIcon({ execution }: { execution: WorkflowExecution }) {
  if (execution.status === 'RUNNING' || execution.status === 'PENDING') return <LoaderCircle size={12} className="flow-spin" />
  if (execution.status === 'FAILED') return <AlertTriangle size={12} />
  if (execution.status === 'CANCELLED') return <CircleX size={12} />
  return <Check size={12} />
}

export function ExecutionDock() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'queue' | 'history'>('queue')
  const workflowId = useFlowStore(state => state.workflowId)
  const executions = useFlowStore(state => state.executions)
  const runError = useFlowStore(state => state.runError)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const cancelRun = useFlowStore(state => state.cancelRun)
  const relevant = useMemo(() => executions.filter(item => item.workflowId === workflowId), [executions, workflowId])
  const queue = relevant.filter(item => item.status === 'PENDING' || item.status === 'RUNNING')
  const history = relevant.filter(item => item.status !== 'PENDING' && item.status !== 'RUNNING')
  const execution = queue[0] ?? history[0]
  if (execution === undefined) {
    return runError === undefined ? null : <section className="execution-dock execution-error" role="alert"><AlertTriangle size={14} /><span><strong>Host execution did not start</strong>{runError}</span></section>
  }
  const completed = execution.nodes.filter(node => ['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(node.status)).length
  const progress = execution.nodes.length === 0 ? 0 : Math.round(completed / execution.nodes.length * 100)
  const visible = tab === 'queue' ? queue : history
  return <section className={'execution-dock queue-dock ' + (open ? 'is-open' : '')} aria-label="Execution queue and history" aria-live="polite">
    <button type="button" className="execution-summary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="runflow-execution-details">
      <span className="execution-icon">{queue.length > 0 ? <LoaderCircle size={14} className="flow-spin" /> : <TerminalSquare size={14} />}</span>
      <span className="execution-copy"><strong>{queue.length > 0 ? `Host queue · ${progress}%` : execution.status === 'FAILED' ? 'Last execution failed' : execution.status === 'CANCELLED' ? 'Last execution stopped' : 'Last execution complete'}</strong><span>{queue.length} active · {history.length} history</span></span>
      <span className="execution-duration">{(elapsed(execution) / 1000).toFixed(2)}s</span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
    </button>
    {queue.length > 0 && <div className="queue-progress" role="progressbar" aria-label="Workflow progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
    {runError !== undefined && <div className="execution-inline-error" role="alert"><AlertTriangle size={12} />{runError}</div>}
    {open && <div id="runflow-execution-details" className="execution-body queue-body">
      <nav aria-label="Execution list"><button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}><Clock3 size={12} />Queue <span>{queue.length}</span></button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><FileClock size={12} />History <span>{history.length}</span></button></nav>
      <div className="queue-list">
        {visible.map(item => <article className={'queue-item status-' + item.status.toLowerCase()} key={item.id}>
          <button onClick={() => { const nodeId = item.nodes[0]?.nodeId; if (nodeId !== undefined) openNodeDetails(nodeId, undefined, item.id) }}>
            <ExecutionStatusIcon execution={item} /><span><strong>{item.status}</strong><small>{item.id.slice(0, 10)} · {item.trigger}</small></span><time>{(elapsed(item) / 1000).toFixed(2)}s</time>
          </button>
          {(item.status === 'RUNNING' || item.status === 'PENDING') && <button className="queue-cancel" onClick={() => void cancelRun()} aria-label={`Cancel ${item.id}`}><Square size={10} fill="currentColor" />Stop</button>}
        </article>)}
        {visible.length === 0 && <div className="queue-empty">{tab === 'queue' ? 'No pending or running executions.' : 'No completed executions yet.'}</div>}
      </div>
      {execution.outputDir !== undefined && <div className="execution-output-dir"><span>Output</span><code>{execution.outputDir}</code></div>}
    </div>}
  </section>
}

import { useMemo, useState } from 'react'
import {
  AlertTriangle, Check, ChevronDown, ChevronUp, CircleX, Clock3, FileClock,
  LoaderCircle, Pause, Play, Square, TerminalSquare,
} from 'lucide-react'
import type { JsonValue, WorkflowExecution } from '../contracts.ts'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore } from './store.ts'

function elapsed(execution: WorkflowExecution): number {
  return execution.startedAt === undefined ? 0 : Math.max(0,
    new Date(execution.finishedAt ?? Date.now()).getTime() - new Date(execution.startedAt).getTime())
}

function ExecutionStatusIcon({ execution }: { execution: WorkflowExecution }) {
  if (execution.status === 'RUNNING' || execution.status === 'PENDING') return <LoaderCircle size={12} className="flow-spin" />
  if (execution.status === 'PAUSED') return <Pause size={12} />
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
  const queue = relevant.filter(item => item.status === 'PENDING' || item.status === 'RUNNING' || item.status === 'PAUSED')
  const history = relevant.filter(item => item.status !== 'PENDING' && item.status !== 'RUNNING' && item.status !== 'PAUSED')
  const execution = queue[0] ?? history[0]
  if (execution === undefined) {
    return runError === undefined ? null : <section className="execution-dock execution-error" role="alert"><AlertTriangle size={14} /><span><strong>Host execution did not start</strong>{runError}</span></section>
  }
  const completed = execution.nodes.filter(node => ['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(node.status)).length
  const progress = execution.nodes.length === 0 ? 0 : Math.round(completed / execution.nodes.length * 100)
  const visible = tab === 'queue' ? queue : history
  return <section className={'execution-dock queue-dock ' + (open ? 'is-open' : '')} aria-label="Execution queue and history" aria-live="polite">
    <button type="button" className="execution-summary" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls="runflow-execution-details">
      <span className="execution-icon">{execution.status === 'PAUSED' ? <Pause size={14} /> : queue.length > 0 ? <LoaderCircle size={14} className="flow-spin" /> : <TerminalSquare size={14} />}</span>
      <span className="execution-copy"><strong>{execution.status === 'PAUSED' ? 'Paused · awaiting input' : queue.length > 0 ? execution.step === undefined ? `Host queue · ${progress}%` : 'Host state graph' : execution.status === 'FAILED' ? 'Last execution failed' : execution.status === 'CANCELLED' ? 'Last execution stopped' : 'Last execution complete'}</strong><span>{queue.length} active · {history.length} history</span></span>
      <span className="execution-duration">{execution.step === undefined ? `${(elapsed(execution) / 1000).toFixed(2)}s` : `${execution.step} steps`}</span>{open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
    </button>
    {queue.length > 0 && execution.step === undefined && <div className="queue-progress" role="progressbar" aria-label="Workflow progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>}
    {runError !== undefined && <div className="execution-inline-error" role="alert"><AlertTriangle size={12} />{runError}</div>}
    {open && <div id="runflow-execution-details" className="execution-body queue-body">
      <nav aria-label="Execution list"><button className={tab === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}><Clock3 size={12} />Queue <span>{queue.length}</span></button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><FileClock size={12} />History <span>{history.length}</span></button></nav>
      <div className="queue-list">
        {visible.map(item => <article className={'queue-item status-' + item.status.toLowerCase()} key={item.id}>
          <button onClick={() => { const nodeId = item.nodes[0]?.nodeId; if (nodeId !== undefined) openNodeDetails(nodeId, undefined, item.id) }}>
            <ExecutionStatusIcon execution={item} /><span><strong>{item.status}</strong><small>{item.id.slice(0, 10)} · {item.trigger}</small></span><time>{item.step === undefined ? `${(elapsed(item) / 1000).toFixed(2)}s` : `${item.step} steps`}</time>
          </button>
          {(item.status === 'RUNNING' || item.status === 'PENDING' || item.status === 'PAUSED') && <button className="queue-cancel" onClick={() => void cancelRun(item.id)} aria-label={`Cancel ${item.id}`}><Square size={10} fill="currentColor" />Stop</button>}
          {item.status === 'PAUSED' && <ResumeExecution key={item.id} execution={item} />}
          {item.state !== undefined && <ExecutionJsonDetails label="Current state" value={item.state} />}
          {item.steps !== undefined && item.steps.length > 0 && <ExecutionStepHistory steps={item.steps} />}
        </article>)}
        {visible.length === 0 && <div className="queue-empty">{tab === 'queue' ? 'No pending or running executions.' : 'No completed executions yet.'}</div>}
      </div>
      {execution.outputDir !== undefined && <div className="execution-output-dir"><span>Output</span><code>{execution.outputDir}</code></div>}
    </div>}
  </section>
}

function ResumeExecution({ execution }: { execution: WorkflowExecution }) {
  const { language } = useRunFlowLocale()
  const resumeRun = useFlowStore(state => state.resumeRun)
  const [input, setInput] = useState('null')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const zh = language === 'zh'
  const resume = async (): Promise<void> => {
    let value: unknown
    try { value = JSON.parse(input) } catch (reason) { setError('JSON: ' + (reason instanceof Error ? reason.message : String(reason))); return }
    setError(undefined); setBusy(true)
    try { await resumeRun(execution.id, value as JsonValue) } finally { setBusy(false) }
  }
  return <div className="execution-resume">
    {Object.entries(execution.checkpoint?.interrupts ?? {}).map(([nodeId, prompt]) => <div key={nodeId}><strong>{nodeId}</strong><pre>{typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)}</pre></div>)}
    <label className="field"><span>{zh ? '恢复输入 · JSON' : 'Resume input · JSON'}</span><textarea aria-label="Resume input · JSON" value={input} onChange={event => setInput(event.target.value)} spellCheck={false} aria-invalid={error !== undefined} /></label>
    <small>{zh ? '该回答会发给所有暂停节点；也可按节点 ID 提供不同回答。恢复使用暂停时的工作流版本。' : 'This answer goes to all paused nodes, or use an object keyed by node ID for separate answers. Resume uses the paused workflow version.'}</small>
    {error !== undefined && <p role="alert" className="field-error">{error}</p>}
    <button type="button" aria-label={`Resume ${execution.id}`} disabled={busy} onClick={() => void resume()}><Play size={12} />{busy ? (zh ? '恢复中…' : 'Resuming…') : (zh ? '恢复执行' : 'Resume execution')}</button>
  </div>
}

function ExecutionJsonDetails({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false)
  return <details className="execution-step-history" onToggle={event => setOpen(event.currentTarget.open)}><summary>{label}</summary>{open && <pre>{JSON.stringify(value, null, 2)}</pre>}</details>
}

function ExecutionStepHistory({ steps }: { steps: NonNullable<WorkflowExecution['steps']> }) {
  const [open, setOpen] = useState(false)
  return <details className="execution-step-history" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}><summary>Step history · {steps.length}</summary>{open && steps.map(step => <ExecutionJsonDetails key={step.step} label={`Step ${step.step} · ${step.nodes.map(node => `${node.nodeId}: ${node.status}`).join(', ')}`} value={step} />)}</details>
}

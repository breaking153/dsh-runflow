import { useEffect, useState } from 'react'
import type { JsonObject } from '../contracts.ts'
import { graphHasCycle } from './connection-planning.ts'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore } from './store.ts'

export function JsonObjectSetting({ label, value, onChange, validate }: {
  label: string; value: JsonObject | undefined; onChange(value: JsonObject | undefined): void; validate?(value: JsonObject): string | undefined
}) {
  const { language } = useRunFlowLocale()
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialized)
  const [error, setError] = useState<string>()
  useEffect(() => { setDraft(serialized); setError(undefined) }, [serialized])
  const commit = (): void => {
    if (draft.trim() === '') { onChange(undefined); setError(undefined); return }
    try {
      const value: unknown = JSON.parse(draft)
      if (value === null || Array.isArray(value) || typeof value !== 'object') throw new Error(language === 'zh' ? '需要 JSON 对象' : 'A JSON object is required')
      const problem = validate?.(value as JsonObject)
      if (problem !== undefined) throw new Error(problem)
      onChange(value as JsonObject); setError(undefined)
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
  }
  return <label className="field"><span>{label}</span><textarea aria-label={label} spellCheck={false} value={draft} aria-invalid={error !== undefined} onChange={event => { setDraft(event.target.value); setError(undefined) }} onBlur={commit} placeholder="{}" />{error !== undefined && <small className="field-error" role="alert">JSON: {error}</small>}</label>
}

export function WorkflowExecutionSettings() {
  const { language, t } = useRunFlowLocale()
  const zh = language === 'zh'
  const execution = useFlowStore(state => state.workflowExecution)
  const setExecution = useFlowStore(state => state.setWorkflowExecution)
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const subflows = useFlowStore(state => state.subflows)
  const rootGraph = useFlowStore(state => state.rootGraphSnapshot)
  const entryNodes = [...(rootGraph?.nodes ?? nodes), ...subflows.flatMap(subflow => subflow.nodes)].filter(node => node.type === 'workflow')
  const [error, setError] = useState<string>()
  const mode = execution?.mode ?? 'dag'
  const entryIds = execution?.entryNodeIds ?? []
  const update = (patch: Partial<NonNullable<typeof execution>>): void => { const next = { mode, ...execution, ...patch }; if (next.entryNodeIds?.length === 0) delete next.entryNodeIds; setExecution(next); setError(undefined) }
  const modeLabel = zh ? '执行模式' : 'Execution mode'
  const stepLabel = zh ? '最大步数' : 'Maximum steps'
  return <fieldset className="workflow-execution-settings">
    <legend>{zh ? '图执行' : 'Graph execution'}</legend>
    <label className="field"><span>{t('executionSemantics')}</span><select aria-label={t('executionSemantics')} value={execution?.semantics ?? 'legacy'} onChange={event => {
      const next = { mode, ...execution }
      if (event.target.value === 'blueprint') next.semantics = 'blueprint'
      else delete next.semantics
      setExecution(next); setError(undefined)
    }}><option value="blueprint">{t('blueprintSemantics')}</option><option value="legacy">{t('legacySemantics')}</option></select><small>{execution?.semantics === 'blueprint' ? t('blueprintSemanticsHint') : t('legacySemanticsHint')}</small></label>
    <label className="field"><span>{modeLabel}</span><select aria-label={modeLabel} value={mode} onChange={event => {
      const next = event.target.value as typeof mode
      const definition = useFlowStore.getState().definition()
      if (next === 'dag' && (graphHasCycle(edges) || graphHasCycle(definition.edges.map(edge => ({ source: edge.from, target: edge.to }))))) {
        setError(zh ? '图中存在循环；请先移除循环连线再切换为 DAG。' : 'This graph contains a cycle. Remove its loop edges before switching to DAG.'); return
      }
      update({ mode: next, ...(next === 'state-graph' && execution?.maxSteps === undefined ? { maxSteps: 100 } : {}) })
    }}><option value="state-graph">{zh ? '状态图 · 支持循环与暂停' : 'State graph · loops and pauses'}</option><option value="dag">{zh ? 'DAG · 无环执行' : 'DAG · acyclic execution'}</option></select></label>
    {error !== undefined && <p className="field-error" role="alert">{error}</p>}
    {mode === 'state-graph' && <>
      <label className="field"><span>{stepLabel}</span><input type="number" aria-label={stepLabel} min={1} max={1000} step={1} value={execution?.maxSteps ?? 100} onChange={event => {
        const value = Number(event.target.value)
        if (Number.isSafeInteger(value) && value > 0 && value <= 1000) update({ maxSteps: value })
        else setError(zh ? '最大步数必须为 1–1000 的整数。' : 'Maximum steps must be an integer from 1 to 1000.')
      }} /><small>{zh ? '每轮就绪节点共同计为一步；达到上限后停止并显示错误。' : 'Each batch of ready nodes is one step. Reaching the limit stops the run with an error.'}</small></label>
      <fieldset className="workflow-entry-options"><legend>{zh ? '入口节点' : 'Entry nodes'}</legend><small>{zh ? '不勾选时使用无上游的节点。纯循环必须选择入口；所有节点须从入口可达。' : 'Leave empty to use nodes without incoming links. Pure loops need an entry; all nodes must be reachable from the entries.'}</small>
        {entryNodes.map(node => <label key={node.id}><input type="checkbox" aria-label={`${zh ? '入口' : 'Entry'}: ${node.data.label}`} checked={entryIds.includes(node.id)} onChange={event => update({ entryNodeIds: event.target.checked ? [...entryIds, node.id] : entryIds.filter(id => id !== node.id) })} /><span>{node.data.label}</span><code>{node.id}</code></label>)}
      </fieldset>
      <JsonObjectSetting label={zh ? '初始状态 · JSON 对象' : 'Initial state · JSON object'} value={execution?.initialState} onChange={initialState => { const next = { mode, ...execution }; if (initialState === undefined) delete next.initialState; else next.initialState = initialState; setExecution(next) }} />
      <JsonObjectSetting label={zh ? '状态归约器 · JSON 对象' : 'State reducers · JSON object'} value={execution?.reducers} validate={value => Object.values(value).every(item => typeof item === 'string' && ['replace', 'append', 'sum', 'merge'].includes(item)) ? undefined : zh ? '归约器只支持 replace、append、sum、merge。' : 'Reducers must be replace, append, sum or merge.'} onChange={reducers => { const next = { mode, ...execution }; if (reducers === undefined) delete next.reducers; else next.reducers = reducers as NonNullable<NonNullable<typeof execution>['reducers']>; setExecution(next) }} />
      <p className="workflow-settings-hint">{zh ? '示例：{"messages":"append","count":"sum"}。同一轮节点写入同一字段时必须定义归约器。' : 'Example: {"messages":"append","count":"sum"}. Define reducers when nodes update the same field in one step.'}</p>
    </>}
  </fieldset>
}

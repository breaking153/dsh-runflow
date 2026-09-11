import { useEffect, useState } from 'react'
import type { JsonObject, JsonValue } from '../contracts.ts'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore } from './store.ts'
import { PropertyField, AdditionalPropertyFields } from './PropertyField.tsx'

const specializedProperties: Record<string, string[]> = {
  "control.branch": [
    "source",
    "path",
    "operator",
    "value"
  ],
  "control.switch": [
    "source",
    "rules"
  ],
  "control.loop": [
    "source",
    "path",
    "operator",
    "value",
    "maxIterations"
  ],
  "control.parallel": [
    "branchCount"
  ],
  "state.read": [
    "path"
  ],
  "state.update": [
    "source",
    "path",
    "key"
  ],
  "control.interrupt": [
    "prompt",
    "stateKey"
  ]
}

export function JsonValueField({ label, value, onChange, validate, propertyKey }: { propertyKey?: string; label: string; value: JsonValue | undefined; onChange(value: JsonValue | undefined): void; validate?(value: JsonValue): string | undefined }) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialized)
  const [error, setError] = useState<string>()
  useEffect(() => { setDraft(serialized); setError(undefined) }, [serialized])
  return <PropertyField propertyKey={propertyKey} label={label}><textarea aria-label={label} spellCheck={false} value={draft} aria-invalid={error !== undefined} onChange={event => { setDraft(event.target.value); setError(undefined) }} onBlur={() => {
    try {
      const value = draft.trim() === '' ? undefined : JSON.parse(draft) as JsonValue
      const problem = value === undefined ? undefined : validate?.(value)
      if (problem !== undefined) throw new Error(problem)
      onChange(value); setError(undefined)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }} />{error !== undefined && <small role="alert" className="field-error">JSON: {error}</small>}</PropertyField>
}

export function isStateGraphNode(type: string): boolean { return type.startsWith('control.') || type.startsWith('state.') }

export function StateGraphNodeConfig({ type, config, onChange }: { type: string; config: JsonObject; onChange(config: JsonObject): void }) {
  const { language } = useRunFlowLocale()
  const mode = useFlowStore(state => state.workflowExecution?.mode ?? 'dag')
  const zh = language === 'zh'
  const set = (key: string, value: JsonValue | undefined): void => { const next = { ...config }; if (value === undefined) delete next[key]; else next[key] = value; onChange(next) }
  const text = (label: string, key: string, fallback = '') => <PropertyField propertyKey={key} label={label}><input aria-label={label} value={String(config[key] ?? fallback)} onChange={event => { if (type === 'control.loop' && key === 'path') onChange({ ...config, path: event.target.value, operator: config['operator'] ?? 'equals' }); else set(key, event.target.value) }} /></PropertyField>
  const source = <PropertyField propertyKey="source" label={zh ? '数据来源' : 'Source'}><select aria-label="Source" value={String(config['source'] ?? 'input')} onChange={event => set('source', event.target.value)}><option value="input">{zh ? '节点输入' : 'Node input'}</option><option value="state">{zh ? '共享状态' : 'Shared state'}</option>{type === 'state.update' && <option value="value">{zh ? '固定值' : 'Literal value'}</option>}</select></PropertyField>
  const compare = <>{text(zh ? '字段路径 · 留空使用整个值' : 'Field path · empty uses the whole value', 'path')}<PropertyField propertyKey="operator" label={zh ? '条件' : 'Condition'}><select aria-label="Condition" value={String(config['operator'] ?? (type === 'control.loop' && config['path'] === undefined ? '' : 'equals'))} onChange={event => { if (type === 'control.loop' && event.target.value === '') { const next = { ...config }; delete next['operator']; delete next['path']; onChange(next) } else set('operator', event.target.value) }}>{type === 'control.loop' && <option value="">{zh ? '只按循环上限' : 'Iteration limit only'}</option>}{['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'exists', 'truthy'].map(value => <option key={value} value={value}>{value}</option>)}</select></PropertyField><JsonValueField propertyKey="value" label={zh ? '比较值 · JSON' : 'Compare value · JSON'} value={config['value']} onChange={value => set('value', value)} /></>
  return <div className="state-graph-node-config">
    {mode !== 'state-graph' && <p role="alert" className="model-catalog-note is-error">{zh ? '此节点需要状态图模式。请在运行设置中切换后执行。' : 'This node requires state graph mode. Switch modes in Run settings before executing.'}</p>}
    {['control.branch', 'control.switch', 'control.loop', 'state.update'].includes(type) && source}
    {(type === 'control.branch' || type === 'control.loop') && compare}
    {type === 'control.switch' && <><JsonValueField propertyKey="rules" label={zh ? '分支规则 · JSON 数组' : 'Branch rules · JSON array'} value={config['rules'] ?? []} validate={value => Array.isArray(value) && value.length <= 4 && value.every(item => typeof item === 'object' && item !== null && !Array.isArray(item)) ? undefined : zh ? '需要最多 4 条规则的数组。' : 'Use an array with up to 4 rule objects.'} onChange={value => set('rules', value)} /><small>{zh ? '规则按顺序对应 case1–case4；第一条匹配生效，否则走 default。例：[{"path":"status","operator":"equals","value":"ready"}]' : 'Rules map to case1–case4 in order. First match wins; otherwise use default. Example: [{"path":"status","operator":"equals","value":"ready"}]'}</small></>}
    {(type === 'control.loop' || type === 'control.parallel') && <PropertyField propertyKey={type === 'control.loop' ? 'maxIterations' : 'branchCount'} label={type === 'control.loop' ? (zh ? '循环上限' : 'Maximum iterations') : (zh ? '并行分支数' : 'Branch count')}><input type="number" min={type === 'control.loop' ? 0 : 1} max={type === 'control.loop' ? 1000 : 4} step={1} value={Number(config[type === 'control.loop' ? 'maxIterations' : 'branchCount'] ?? (type === 'control.loop' ? 10 : 2))} onChange={event => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= (type === 'control.loop' ? 0 : 1) && value <= (type === 'control.loop' ? 1000 : 4)) set(type === 'control.loop' ? 'maxIterations' : 'branchCount', value) }} /><small>{type === 'control.loop' ? (zh ? '满足条件且未达上限走 continue，否则走 done。' : 'Use continue while the condition matches and the limit is not reached; otherwise use done.') : (zh ? '只激活前 N 个 branch 引脚；引脚 ID 保持不变。' : 'Activate the first N branch ports. Port IDs stay stable.')}</small></PropertyField>}
    {(type === 'state.read' || type === 'state.update') && text(zh ? '读取路径 · 留空使用整个值' : 'Read path · empty uses the whole value', 'path')}
    {type === 'state.update' && <>{text(zh ? '写入状态字段' : 'State key', 'key', 'result')}<small>{zh ? '多个节点同时更新同一字段时，请在运行设置中配置归约器。' : 'Configure a reducer in Run settings when multiple nodes update this key together.'}</small></>}
    {type === 'control.interrupt' && <><JsonValueField propertyKey="prompt" label={zh ? '暂停提示 · JSON' : 'Pause prompt · JSON'} value={config['prompt'] ?? 'Review before continuing'} onChange={value => set('prompt', value)} />{text(zh ? '回答写入状态字段' : 'Answer state key', 'stateKey', 'approval')}<small>{zh ? '执行在此暂停，执行面板中提供回答后继续。' : 'Pause here. Answer in the execution panel to continue.'}</small></>}
    {type === 'control.join' && <p>{zh ? '等待每一条连入边的新消息后继续。只连接一定会执行的并行分支，不要合并互斥条件分支。' : 'Wait for a new message on every incoming edge. Connect branches that all run; do not join mutually exclusive condition routes.'}</p>}
    {type === 'control.end' && <p>{zh ? '结束当前分支。其他活动分支继续执行。' : 'End this branch. Other active branches continue.'}</p>}
    <AdditionalPropertyFields exclude={specializedProperties[type] ?? []} />
  </div>
}

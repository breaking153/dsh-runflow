import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { ArrowRight, Box, Copy, Group, LibraryBig, LoaderCircle, Play, Route, Search, Settings2, Trash2, X } from 'lucide-react'
import type { JsonValue, NodeCategory, WorkflowNodeDescriptor } from '../contracts.ts'
import { CATEGORY_LABELS, NodeIcon, descriptorFor } from './catalog.tsx'
import { AdditionalPropertyFields, PropertyContext, PropertyField, PropertyOptionsField } from './PropertyField.tsx'
import { configurableProperties } from '../node-properties.ts'
import { modelsForProvider, useFlowModelCatalog } from './model-catalog.ts'
import { useFlowRuntime } from './runtime.ts'
import { useFlowStore } from './store.ts'
import { WebhookSettings } from './WebhookSettings.tsx'
import { StateGraphNodeConfig, isStateGraphNode } from './StateGraphNodeConfig.tsx'
import { LightCodeEditor } from './LightCodeEditor.tsx'
import { useRunFlowLocale } from './locale.ts'

const specializedProperties: Record<string, string[]> = {
  "http.request": [
    "method",
    "url"
  ],
  "trigger.schedule": [
    "cron"
  ],
  "builtin.condition": [
    "path",
    "operator",
    "value"
  ],
  "builtin.filter": [
    "path",
    "operator",
    "value"
  ],
  "builtin.limit": [
    "maxItems"
  ],
  "builtin.switch": [
    "rules"
  ],
  "builtin.sort": [
    "path",
    "order"
  ],
  "builtin.aggregate": [
    "operation",
    "path"
  ],
  "builtin.json-stringify": [
    "pretty"
  ],
  "builtin.wait": [
    "durationMs"
  ],
  "builtin.stop-error": [
    "message"
  ],
  "script.javascript": [
    "description",
    "code"
  ],
  "storage.write": [
    "collection"
  ],
  "dsh.agent": [
    "subagentProvider",
    "label",
    "agentOptions.provider",
    "agentOptions.model",
    "agentOptions.reasoningEffort",
    "agentOptions.maxTokens",
    "maxDepth",
    "toolFilter.allow",
    "toolFilter.deny",
    "outputSchema",
    "persona",
    "prompt"
  ]
}

export function NodePalette({ hidden = false, onClose, onNodeAdded }: { hidden?: boolean; onClose?(): void; onNodeAdded?(): void }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const addNode = useFlowStore(state => state.addNode)
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = nodeCatalog.filter(item => normalized.length === 0
      || `${item.title} ${item.description} ${item.type}`.toLowerCase().includes(normalized))
    return (Object.keys(CATEGORY_LABELS) as NodeCategory[])
      .map(category => ({ category, items: filtered.filter(item => item.category === category) }))
      .filter(group => group.items.length > 0)
  }, [nodeCatalog, query])
  useEffect(() => {
    if (!hidden && window.innerWidth <= 900) searchRef.current?.focus()
  }, [hidden])

  const drag = (event: DragEvent, descriptor: WorkflowNodeDescriptor): void => {
    event.dataTransfer.setData('application/dsh-runflow-node', descriptor.type)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside id="runflow-node-library" className={`flow-panel palette ${hidden ? 'mobile-hidden' : ''}`} aria-label="节点库">
      <div className="panel-heading"><span><strong>Node Library</strong><small>点击添加，或拖到画布</small></span><span className="panel-heading-actions"><LibraryBig size={16} color="#64748b" /><button type="button" className="mobile-panel-close" onClick={onClose} aria-label="关闭节点库"><X size={15} /></button></span></div>
      <label className="palette-search">
        <Search size={15} />
        <input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索节点..." aria-label="搜索节点" />
      </label>
      <div className="palette-scroll">
        {groups.length === 0 && <div className="palette-empty"><Search size={22} /><strong>没有匹配节点</strong><span>尝试搜索节点名称、类型或用途</span></div>}
        {groups.map(group => (
          <section className="palette-group" key={group.category}>
            <div className="palette-group-title">{CATEGORY_LABELS[group.category]}<span>{group.items.length}</span></div>
            {group.items.map(item => (
              <button
                type="button"
                className="palette-node"
                key={item.type}
                draggable={item.available !== false}
                disabled={item.available === false}
                onDragStart={event => drag(event, item)}
                onClick={() => { addNode(item); onNodeAdded?.() }}
                title={item.available === false ? `${item.title} 尚未启用` : `添加 ${item.title}`}
              >
                <span className="palette-node-icon" style={{ '--item-color': item.color } as CSSProperties}><NodeIcon name={item.icon} /></span>
                <span className="palette-node-copy"><strong>{item.title}{item.available === false && <em>未启用</em>}</strong><span>{item.description}</span></span>
                <ArrowRight size={14} />
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ConfigField({ label, value, onChange, type = 'text', list, placeholder, propertyKey }: {
  propertyKey?: string
  label: string
  value: JsonValue | undefined
  onChange(value: JsonValue): void
  type?: 'text' | 'number'
  list?: string
  placeholder?: string
}) {
  return (
    <PropertyField propertyKey={propertyKey} label={label}>
      <input
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        list={list}
        placeholder={placeholder}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={event => onChange(type === 'number' && event.target.value !== ''
          ? Number(event.target.value)
          : event.target.value)}
      />
    </PropertyField>
  )
}

function JsonConfigField({ label, value, onChange, placeholder, objectRoot = true, propertyKey }: {
  propertyKey?: string
  label: string
  value: JsonValue | undefined
  onChange(value: JsonValue | undefined): void
  placeholder?: string
  objectRoot?: boolean
}) {
  const serialized = value === undefined ? '' : JSON.stringify(value, null, 2)
  const [draft, setDraft] = useState(serialized)
  const [error, setError] = useState<string>()
  useEffect(() => { setDraft(serialized); setError(undefined) }, [serialized])
  const commit = (): void => {
    const source = draft.trim()
    if (source === '') {
      setError(undefined)
      onChange(undefined)
      return
    }
    try {
      const parsed = JSON.parse(source) as JsonValue
      if (objectRoot && (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))) {
        throw new Error('根节点必须是 JSON object')
      }
      setError(undefined)
      onChange(parsed)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  return (
    <PropertyField propertyKey={propertyKey} label={label}>
      <textarea
        className={error === undefined ? undefined : 'field-invalid'}
        spellCheck={false}
        value={draft}
        placeholder={placeholder}
        onChange={event => { setDraft(event.target.value); setError(undefined) }}
        onBlur={commit}
      />
      {error !== undefined && <small className="field-error">JSON 无效：{error}</small>}
    </PropertyField>
  )
}

function StringListField({ label, value, onChange, placeholder, propertyKey }: {
  propertyKey?: string
  label: string
  value: JsonValue | undefined
  onChange(value: string[] | undefined): void
  placeholder?: string
}) {
  const items = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? value.split(/[\n,]/u).map(item => item.trim()).filter(Boolean)
      : []
  const serialized = items.join('\n')
  const [draft, setDraft] = useState(serialized)
  useEffect(() => { setDraft(serialized) }, [serialized])
  const commit = (): void => {
    const next = [...new Set(draft.split(/[\n,]/u).map(item => item.trim()).filter(Boolean))]
    onChange(next.length === 0 ? undefined : next)
  }
  return (
    <PropertyField propertyKey={propertyKey} label={label}>
      <textarea
        className="compact-textarea"
        value={draft}
        placeholder={placeholder}
        onChange={event => { setDraft(event.target.value) }}
        onBlur={commit}
      />
    </PropertyField>
  )
}

export function PropertyInspector({ hidden = false, onClose, showOutputTab = true }: { hidden?: boolean; onClose?(): void; showOutputTab?: boolean }) {
  const { t } = useRunFlowLocale()
  const inspectorRef = useRef<HTMLElement>(null)
  const [inspectorTab, setInspectorTab] = useState<'parameters' | 'settings' | 'output'>('parameters')
  const modelCatalog = useFlowModelCatalog()
  const selectedNodeId = useFlowStore(state => state.selectedNodeId)
  const node = useFlowStore(state => state.nodes.find(item => item.id === selectedNodeId))
  const nodeCatalog = useFlowStore(state => state.nodeCatalog)
  const updateNode = useFlowStore(state => state.updateNode)
  const removeNode = useFlowStore(state => state.removeNode)
  const duplicateNode = useFlowStore(state => state.duplicateNode)
  const run = useFlowStore(state => state.run)
  const running = useFlowStore(state => state.running)
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const runtime = useFlowRuntime()
  const capabilities = useFlowStore(state => state.capabilities)
  const subagentProviders = useFlowStore(state => state.subagentProviders)
  const enterSubflow = useFlowStore(state => state.enterSubflow)
  const renameSubflow = useFlowStore(state => state.renameSubflow)
  useEffect(() => {
    if (hidden || window.innerWidth > 900 || node === undefined) return
    inspectorRef.current?.querySelector<HTMLElement>('.inspector-scroll input, .inspector-scroll select, .inspector-scroll textarea, .debug-button')?.focus()
  }, [hidden, node?.id])
  useEffect(() => setInspectorTab('parameters'), [node?.id])

  if (node === undefined) {
    return (
      <aside ref={inspectorRef} id="runflow-inspector" className={`flow-panel inspector ${hidden ? 'mobile-hidden' : ''}`} aria-label="属性面板">
        <div className="panel-heading"><span><strong>{t('inspector')}</strong><small>{t('inspectorHint')}</small></span><span className="panel-heading-actions"><Settings2 size={16} color="#64748b" /><button type="button" className="mobile-panel-close" onClick={onClose} aria-label={t('closeInspector')}><X size={15} /></button></span></div>
        <div className="inspector-empty"><div><Settings2 size={28} /><p>{t('chooseNode')}</p></div></div>
      </aside>
    )
  }
  const setConfig = (key: string, value: JsonValue): void => updateNode(node.id, { config: { ...node.data.config, [key]: value } })
  const setOptionalConfig = (key: string, value: JsonValue | undefined): void => {
    const config = { ...node.data.config }
    if (value === undefined || value === '') delete config[key]
    else config[key] = value
    updateNode(node.id, { config })
  }
  const type = node.data.nodeType
  if (node.type !== 'workflow') {
    const visualKind = node.type === 'runflow-subflow' ? 'Executable subflow' : node.type === 'runflow-group' ? 'Visual group' : 'Reroute point'
    const VisualIcon = node.type === 'runflow-subflow' ? Box : node.type === 'runflow-group' ? Group : Route
    const rename = (label: string): void => {
      if (node.type === 'runflow-subflow') renameSubflow(node.id, label)
      else updateNode(node.id, { label })
    }
    return <aside ref={inspectorRef} id="runflow-inspector" className={`flow-panel inspector ${hidden ? 'mobile-hidden' : ''}`} aria-label="属性面板">
      <div className="panel-heading"><span><strong>{t('inspector')}</strong><small>{t('inspectorHint')}</small></span><span className="panel-heading-actions"><span className="panel-kicker">{node.id}</span><button type="button" className="mobile-panel-close" onClick={onClose} aria-label={t('closeInspector')}><X size={15} /></button></span></div>
      <div className="inspector-scroll visual-node-inspector">
        <div className="inspector-node-head"><span className="inspector-node-icon"><VisualIcon size={18} /></span><span><strong>{node.data.label}</strong><small>{visualKind}</small></span><span className="inspector-actions"><button type="button" className="danger" onClick={() => { removeNode(node.id); onClose?.() }} aria-label="删除编辑器结构"><Trash2 size={14} /></button></span></div>
        {node.type !== 'runflow-reroute' && <section className="form-section"><div className="form-section-title">Presentation</div><ConfigField label="显示名称" value={node.data.label} onChange={value => rename(String(value))} /></section>}
        <section className="form-section visual-node-summary"><div className="form-section-title">Behaviour</div>
          {node.type === 'runflow-group' && <><strong>{node.data.memberNodeIds?.length ?? 0} nodes</strong><p>仅用于画布整理。移动分组会同步移动成员，执行时不会进入 DSH DAG。</p></>}
          {node.type === 'runflow-reroute' && <><strong>Visual edge routing</strong><p>只改变连线走向；保存和执行时会自动折叠为普通边。</p></>}
          {node.type === 'runflow-subflow' && <><strong>{node.data.inputs.length} inputs · {node.data.outputs.length} outputs</strong><p>画布中折叠显示；保存和 Host 执行时展开为普通节点与类型化边。</p><button className="debug-button" onClick={() => enterSubflow(node.id)}><Box size={14} />进入子图</button></>}
        </section>
      </div>
    </aside>
  }
  const nestedAgentOptions = typeof node.data.config['agentOptions'] === 'object'
    && node.data.config['agentOptions'] !== null
    && !Array.isArray(node.data.config['agentOptions'])
    ? node.data.config['agentOptions']
    : {}
  const agentOptionValue = (key: string): JsonValue | undefined =>
    Object.hasOwn(nestedAgentOptions, key) ? nestedAgentOptions[key] : node.data.config[key]
  const setAgentOption = (key: string, value: JsonValue | undefined): void => {
    const config = { ...node.data.config }
    const options = { ...nestedAgentOptions }
    delete config[key]
    if (value === undefined || value === '') delete options[key]
    else options[key] = value
    if (key === 'provider' || key === 'model') {
      delete options['reasoningEffort']
      delete config['reasoningEffort']
    }
    if (key === 'provider') {
      delete options['model']
      delete config['model']
    }
    if (Object.keys(options).length === 0) delete config['agentOptions']
    else config['agentOptions'] = options
    updateNode(node.id, { config })
  }
  const nestedToolFilter = typeof node.data.config['toolFilter'] === 'object'
    && node.data.config['toolFilter'] !== null
    && !Array.isArray(node.data.config['toolFilter'])
    ? node.data.config['toolFilter']
    : {}
  const setToolFilter = (key: 'allow' | 'deny', value: string[] | undefined): void => {
    const config = { ...node.data.config }
    const filter = { ...nestedToolFilter }
    if (value === undefined) delete filter[key]
    else filter[key] = value
    delete config[key === 'allow' ? 'toolAllow' : 'toolDeny']
    if (Object.keys(filter).length === 0) delete config['toolFilter']
    else config['toolFilter'] = filter
    updateNode(node.id, { config })
  }
  const modelProvider = String(agentOptionValue('provider') ?? '')
  const providerModels = modelsForProvider(modelCatalog, modelProvider)
  const modelId = String(agentOptionValue('model') ?? '')
  const selectedModel = providerModels.find(model => model.id === (modelId || modelCatalog.current?.model))
  const hasConfiguredAgentOptions = ['provider', 'model', 'reasoningEffort', 'maxTokens']
    .some(key => agentOptionValue(key) !== undefined && agentOptionValue(key) !== '')
  const descriptor = nodeCatalog.find(item => item.type === type) ?? descriptorFor(type)
  const declaredOptions = (key: string, fallback: string[] = []): { value: string; label: string }[] => {
    const schema = configurableProperties(descriptor).find(property => property.key === key)?.schema
    const values = Array.isArray(schema?.enum) ? schema.enum.filter((value): value is string => typeof value === 'string') : fallback
    return values.map(value => ({ value, label: value }))
  }
  const configuredSubagentProvider = String(node.data.config['subagentProvider'] ?? '')
  const effectiveSubagentProvider = configuredSubagentProvider || subagentProviders[0]?.id || ''
  const selectedSubagentProvider = subagentProviders.find(provider => provider.id === effectiveSubagentProvider)

  return (
    <PropertyContext.Provider value={{ nodeId: node.id, descriptor }}><aside ref={inspectorRef} id="runflow-inspector" className={`flow-panel inspector ${hidden ? 'mobile-hidden' : ''}`} aria-label={t('inspector')}>
      <div className="panel-heading"><span><strong>{t('inspector')}</strong><small>{t('inspectorHint')}</small></span><span className="panel-heading-actions"><span className="panel-kicker">{node.id}</span><button type="button" className="mobile-panel-close" onClick={onClose} aria-label={t('closeInspector')}><X size={15} /></button></span></div>
      <div className="inspector-scroll">
        <div className="inspector-node-head">
          <span className="inspector-node-icon" style={{ '--node-color': node.data.color } as CSSProperties}><NodeIcon name={node.data.icon} size={20} /></span>
          <span><strong>{node.data.label}</strong><small>{type}</small></span>
          <span className="inspector-actions">
            <button type="button" onClick={() => duplicateNode(node.id)} aria-label={t('duplicateNode')} title={t('duplicateNode')}><Copy size={14} /></button>
            <button type="button" className="danger" onClick={() => { removeNode(node.id); onClose?.() }} aria-label={t('deleteNode')} title={t('deleteNode')}><Trash2 size={14} /></button>
          </span>
        </div>
        <nav className="inspector-tabs" aria-label={t('inspector')}>
          <button className={inspectorTab === 'parameters' ? 'active' : ''} onClick={() => setInspectorTab('parameters')}>{t('parameters')}</button>
          <button className={inspectorTab === 'settings' ? 'active' : ''} onClick={() => setInspectorTab('settings')}>{t('settings')}</button>
          {showOutputTab && node.data.executionRecord !== undefined && <button className={inspectorTab === 'output' ? 'active' : ''} onClick={() => setInspectorTab('output')}>{t('output')}</button>}
        </nav>
        <section className={'form-section ' + (inspectorTab === 'parameters' ? '' : 'inspector-tab-hidden')}>
          <div className="form-section-title">{t('general')}</div>
          <ConfigField label={t('displayName')} value={node.data.label} onChange={value => updateNode(node.id, { label: String(value) })} />
        </section>
        <section className={'form-section ' + (inspectorTab === 'settings' ? '' : 'inspector-tab-hidden')}>
          <div className="form-section-title">{t('settings')}</div>
          <div className="field-row">
            <ConfigField label={t('retry')} type="number" value={node.data.config['retry'] ?? 0} onChange={value => setConfig('retry', value)} />
            <ConfigField label={t('timeout')} type="number" value={node.data.config['timeoutMs'] ?? 30000} onChange={value => setConfig('timeoutMs', value)} />
          </div>
        </section>
        <section className={'form-section ' + (inspectorTab === 'parameters' ? '' : 'inspector-tab-hidden')}>
          <div className="form-section-title">{t('configuration')}</div>
          {isStateGraphNode(type) && <StateGraphNodeConfig key={node.id} type={type} config={node.data.config} onChange={config => updateNode(node.id, { config })} />}
          {type === 'trigger.agent' && <p className="model-catalog-note">{capabilities.triggers?.agent ? 'AI Agent 可通过 RunFlow 工具向此入口传入 JSON。' : '当前 Host 未开放 Agent 触发能力；工作流可继续编辑。'}</p>}
          {type === 'trigger.webhook' && <WebhookSettings triggerNodeId={node.id} />}
          {type === 'trigger.schedule' && <ConfigField propertyKey="cron" label="Cron Expression" value={node.data.config['cron'] ?? '0 8 * * *'} onChange={value => setConfig('cron', value)} />}
          {type === 'http.request' && <>
            <PropertyOptionsField key={node.id + '-method'} propertyKey="method" label="Method" value={String(node.data.config['method'] ?? 'GET')} options={declaredOptions('method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])} allowCustom onChange={value => setConfig('method', value)} />
            <ConfigField propertyKey="url" label="URL" value={node.data.config['url']} onChange={value => setConfig('url', value)} />
          </>}
          {(type === 'builtin.condition' || type === 'builtin.filter') && <>
            <ConfigField propertyKey="path" label="Input Path" value={node.data.config['path']} onChange={value => setConfig('path', value)} />
            <PropertyOptionsField propertyKey="operator" label="Operator" value={String(node.data.config['operator'] ?? 'equals')} options={declaredOptions('operator')} onChange={value => setConfig('operator', value)} />
            <ConfigField propertyKey="value" label="Compare Value" value={node.data.config['value']} onChange={value => setConfig('value', value)} />
          </>}
          {type === 'builtin.limit' && <ConfigField propertyKey="maxItems" label="Max Items" type="number" value={node.data.config['maxItems'] ?? 10} onChange={value => setConfig('maxItems', value)} />}
          {type === 'builtin.switch' && <JsonConfigField propertyKey="rules" label="Rules JSON" objectRoot={false} value={node.data.config['rules']} onChange={value => setOptionalConfig('rules', value)} placeholder={'[\n  { "path": "status", "operator": "equals", "value": "ready" }\n]'} />}
          {type === 'builtin.sort' && <>
            <ConfigField propertyKey="path" label="Sort Path" value={node.data.config['path']} onChange={value => setConfig('path', value)} />
            <PropertyOptionsField propertyKey="order" label="Order" value={String(node.data.config['order'] ?? 'asc')} options={declaredOptions('order')} onChange={value => setConfig('order', value)} />
          </>}
          {type === 'builtin.aggregate' && <>
            <PropertyOptionsField propertyKey="operation" label="Operation" value={String(node.data.config['operation'] ?? 'count')} options={declaredOptions('operation')} onChange={value => setConfig('operation', value)} />
            <ConfigField propertyKey="path" label="Value Path" value={node.data.config['path']} onChange={value => setConfig('path', value)} />
          </>}
          {type === 'builtin.json-stringify' && <PropertyField propertyKey="pretty" label="Formatting"><select value={node.data.config['pretty'] === true ? 'pretty' : 'compact'} onChange={event => setConfig('pretty', event.target.value === 'pretty')}><option value="compact">Compact</option><option value="pretty">Pretty printed</option></select></PropertyField>}
          {type === 'builtin.wait' && <ConfigField propertyKey="durationMs" label="Duration (ms)" type="number" value={node.data.config['durationMs'] ?? 1000} onChange={value => setConfig('durationMs', value)} />}
          {type === 'builtin.stop-error' && <ConfigField propertyKey="message" label="Error Message" value={node.data.config['message']} onChange={value => setConfig('message', value)} />}
          {type === 'dsh.agent' && <>
            <PropertyField propertyKey="subagentProvider" label="Subagent Provider"><select value={configuredSubagentProvider} onChange={event => setOptionalConfig('subagentProvider', event.target.value || undefined)}>
              <option value="">自动选择{subagentProviders[0] === undefined ? '' : ` · ${subagentProviders[0].id}`}</option>
              {configuredSubagentProvider !== '' && !subagentProviders.some(provider => provider.id === configuredSubagentProvider)
                && <option value={configuredSubagentProvider}>{configuredSubagentProvider} · 当前不可用</option>}
              {subagentProviders.map(provider => <option key={provider.id} value={provider.id}>{provider.id}{provider.inheritsParentContext ? ' · 继承上下文' : ' · 独立上下文'}</option>)}
            </select></PropertyField>
            {selectedSubagentProvider === undefined
              ? <div className="model-catalog-note is-error">Host 当前没有可用的 Subagent Provider；Agent 节点会拒绝执行。</div>
              : <div className="agent-capabilities" aria-label="Subagent Provider capabilities">
                  <span className={selectedSubagentProvider.inheritsParentContext ? 'is-on' : ''}>{selectedSubagentProvider.inheritsParentContext ? '继承上下文' : '独立上下文'}</span>
                  {Object.entries(selectedSubagentProvider.capabilities).map(([name, enabled]) => <span key={name} className={enabled ? 'is-on' : 'is-off'}>{name}</span>)}
                </div>}
            <ConfigField propertyKey="label" label="Child Label（可选）" value={node.data.config['label']} onChange={value => setOptionalConfig('label', value)} placeholder="默认使用节点显示名称" />
            <div className="agent-option-heading"><strong>AgentOptions</strong><span>留空时继承 Provider 或父 Agent</span></div>
            <PropertyOptionsField key={node.id + '-provider'} propertyKey="agentOptions.provider" label="Model Provider" value={modelProvider}
              options={modelCatalog.groups.map(group => ({ value: group.id, label: group.name === group.id ? group.id : `${group.name} · ${group.id}` }))}
              emptyLabel={`继承父 Agent${modelCatalog.current === null ? '' : ` · ${modelCatalog.current.provider}`}`} allowCustom onChange={value => setAgentOption('provider', value)} />
            <PropertyOptionsField key={node.id + '-model-' + modelProvider} propertyKey="agentOptions.model" label="Model ID" value={modelId}
              options={providerModels.map(model => ({ value: model.id, label: model.name === model.id ? model.id : `${model.name} · ${model.id}` }))}
              emptyLabel={`继承父 Agent${modelCatalog.current === null ? '' : ` · ${modelCatalog.current.model}`}`} allowCustom onChange={value => setAgentOption('model', value)} />
            <PropertyOptionsField key={node.id + '-effort-' + modelProvider + '-' + modelId} propertyKey="agentOptions.reasoningEffort" label="Reasoning Effort" value={String(agentOptionValue('reasoningEffort') ?? '')}
              options={selectedModel?.reasoning?.efforts.map(effort => ({ value: effort.id, label: effort.name })) ?? []}
              emptyLabel="继承父 Agent / 模型默认" allowCustom onChange={value => setAgentOption('reasoningEffort', value)} />
            <div className={`model-catalog-note ${modelCatalog.status === 'error' ? 'is-error' : ''}`}>
              {modelCatalog.status === 'loading' && '正在从当前 DSH 会话加载模型目录…'}
              {modelCatalog.status === 'selecting' && '当前 DSH 会话正在切换模型…'}
              {modelCatalog.status === 'ready' && (modelCatalog.groups.length > 0 ? `${modelCatalog.groups.length} 个 Provider · ${modelCatalog.groups.reduce((count, group) => count + group.models.length, 0)} 个模型` : 'Host 当前没有公布可选模型；可保留继承设置或选择自定义。')}
              {modelCatalog.status === 'error' && `目录加载失败：${modelCatalog.error ?? '未知错误'}（已加载的选项和自定义值仍可使用）`}
              {modelCatalog.status === 'idle' && '打开一个主会话后会自动加载模型目录；也可选择自定义。'}
              {modelCatalog.failures.length > 0 && ` · ${modelCatalog.failures.length} 个 Provider 加载失败`}
              {selectedModel !== undefined && selectedModel.reasoning === undefined && ' · 所选模型未公布推理强度选项'}
            </div>
            <div className="field-row">
              <ConfigField propertyKey="agentOptions.maxTokens" label="Max Tokens (> 0)" type="number" value={agentOptionValue('maxTokens')} onChange={value => setAgentOption('maxTokens', value)} />
              <ConfigField propertyKey="maxDepth" label="Max Depth (≥ 0)" type="number" value={node.data.config['maxDepth']} onChange={value => setOptionalConfig('maxDepth', value)} />
            </div>
            {selectedSubagentProvider !== undefined && !selectedSubagentProvider.capabilities.agentOptions
              && hasConfiguredAgentOptions
              && <div className="model-catalog-note is-error">所选 Provider 不支持 AgentOptions；请清空模型、推理强度和 Max Tokens，或切换 Provider。</div>}
            <div className="agent-option-heading"><strong>Child capabilities</strong><span>按 Provider 能力在启动前严格校验</span></div>
            <StringListField propertyKey="toolFilter.allow" label="Tool allow（每行一个全局工具名）" value={nestedToolFilter['allow'] ?? node.data.config['toolAllow']} onChange={value => setToolFilter('allow', value)} placeholder="留空表示不设置 allow 限制" />
            <StringListField propertyKey="toolFilter.deny" label="Tool deny（每行一个全局工具名）" value={nestedToolFilter['deny'] ?? node.data.config['toolDeny']} onChange={value => setToolFilter('deny', value)} placeholder={'例如 shell\nrun_code'} />
            <JsonConfigField propertyKey="outputSchema"
              label="Output Schema · object-rooted JSON Schema"
              value={node.data.config['outputSchema']}
              onChange={value => setOptionalConfig('outputSchema', value)}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
            />
            <PropertyField propertyKey="persona" label="Persona（可选）"><textarea className="compact-textarea" value={String(node.data.config['persona'] ?? '')} onChange={event => setOptionalConfig('persona', event.target.value || undefined)} /></PropertyField>
            {selectedSubagentProvider !== undefined && (
              (!selectedSubagentProvider.capabilities.outputSchema && node.data.config['outputSchema'] !== undefined)
              || (!selectedSubagentProvider.capabilities.depthLimit && node.data.config['maxDepth'] !== undefined)
              || (!selectedSubagentProvider.capabilities.toolFilter && Object.keys(nestedToolFilter).length > 0)
              || (!selectedSubagentProvider.capabilities.persona && String(node.data.config['persona'] ?? '').trim() !== '')
            ) && <div className="model-catalog-note is-error">当前配置使用了 Provider 未声明支持的启动能力；Host 会明确拒绝执行，不会静默忽略。</div>}
            <PropertyField propertyKey="prompt" label="Prompt · {{input}}"><textarea value={String(node.data.config['prompt'] ?? '')} onChange={event => setOptionalConfig('prompt', event.target.value || undefined)} /></PropertyField>
          </>}
          {type === 'script.javascript' && <>
            <ConfigField propertyKey="description" label="执行说明" value={node.data.config['description']} onChange={value => setConfig('description', value)} />
            <PropertyField propertyKey="code" label="JavaScript"><LightCodeEditor label="JavaScript · input / inputs / config / runflow" profile="run-code" minRows={10} value={String(node.data.config['code'] ?? '')} onChange={value => setConfig('code', value)} /></PropertyField>
            {!capabilities.runCode && <div className="model-catalog-note is-error">当前会话未暴露 run_code。切换到 DSH 创造模式后再执行此节点。</div>}
          </>}
          {type === 'storage.write' && <ConfigField propertyKey="collection" label="Collection" value={node.data.config['collection']} onChange={value => setConfig('collection', value)} />}
          {!isStateGraphNode(type) && <AdditionalPropertyFields exclude={specializedProperties[type] ?? []} />}
        </section>
        {showOutputTab && inspectorTab === 'output' && node.data.executionRecord !== undefined && <section className="form-section inspector-output-panel">
          <div className="form-section-title">{t('output')}</div>
          <p>{t('outputAvailable')}</p>
          <pre>{JSON.stringify(node.data.executionRecord.outputPorts ?? node.data.executionRecord.output ?? null, null, 2)}</pre>
          <button type="button" className="inspect-output-button" onClick={() => openNodeDetails(node.id)}>{t('output')}</button>
        </section>}
        <button
          type="button"
          className="debug-button"
          onClick={() => void run(node.id)}
          disabled={running || runtime.sessionId === undefined}
          title={runtime.sessionId === undefined ? runtime.reason : '在 Host 执行此节点及其全部上游节点'}
        >
          {running ? <LoaderCircle size={15} className="flow-spin" /> : <Play size={15} fill="currentColor" />}
          {running ? t('runningHost') : t('runNode')}
        </button>
      </div>
    </aside></PropertyContext.Provider>
  )
}

import { useMemo, useState, type CSSProperties, type DragEvent } from 'react'
import { ArrowRight, Copy, LibraryBig, Play, Search, Settings2, Trash2 } from 'lucide-react'
import type { JsonValue, NodeCategory, WorkflowNodeDescriptor } from '../contracts.ts'
import { CATEGORY_LABELS, NODE_CATALOG, NodeIcon } from './catalog.tsx'
import { modelsForProvider, useFlowModelCatalog } from './model-catalog.ts'
import { useFlowStore } from './store.ts'

export function NodePalette({ hidden = false }: { hidden?: boolean }) {
  const [query, setQuery] = useState('')
  const addNode = useFlowStore(state => state.addNode)
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = NODE_CATALOG.filter(item => normalized.length === 0
      || `${item.title} ${item.description} ${item.type}`.toLowerCase().includes(normalized))
    return (Object.keys(CATEGORY_LABELS) as NodeCategory[])
      .map(category => ({ category, items: filtered.filter(item => item.category === category) }))
      .filter(group => group.items.length > 0)
  }, [query])

  const drag = (event: DragEvent, descriptor: WorkflowNodeDescriptor): void => {
    event.dataTransfer.setData('application/dsh-flow-node', descriptor.type)
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <aside className={`flow-panel palette ${hidden ? 'mobile-hidden' : ''}`} aria-label="节点库">
      <div className="panel-heading"><strong>Node Library</strong><LibraryBig size={16} color="#64748b" /></div>
      <label className="palette-search">
        <Search size={15} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索节点..." aria-label="搜索节点" />
      </label>
      <div className="palette-scroll">
        {groups.map(group => (
          <section className="palette-group" key={group.category}>
            <div className="palette-group-title">{CATEGORY_LABELS[group.category]}<span>{group.items.length}</span></div>
            {group.items.map(item => (
              <button
                type="button"
                className="palette-node"
                key={item.type}
                draggable
                onDragStart={event => drag(event, item)}
                onClick={() => addNode(item)}
                title={`添加 ${item.title}`}
              >
                <span className="palette-node-icon" style={{ '--item-color': item.color } as CSSProperties}><NodeIcon name={item.icon} /></span>
                <span className="palette-node-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
                <ArrowRight size={14} />
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ConfigField({ label, value, onChange, type = 'text', list, placeholder }: {
  label: string
  value: JsonValue | undefined
  onChange(value: JsonValue): void
  type?: 'text' | 'number'
  list?: string
  placeholder?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        list={list}
        placeholder={placeholder}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={event => onChange(type === 'number' ? Number(event.target.value) : event.target.value)}
      />
    </label>
  )
}

export function PropertyInspector({ hidden = false }: { hidden?: boolean }) {
  const modelCatalog = useFlowModelCatalog()
  const selectedNodeId = useFlowStore(state => state.selectedNodeId)
  const node = useFlowStore(state => state.nodes.find(item => item.id === selectedNodeId))
  const updateNode = useFlowStore(state => state.updateNode)
  const removeNode = useFlowStore(state => state.removeNode)
  const duplicateNode = useFlowStore(state => state.duplicateNode)
  const run = useFlowStore(state => state.run)

  if (node === undefined) {
    return (
      <aside className={`flow-panel inspector ${hidden ? 'mobile-hidden' : ''}`} aria-label="属性面板">
        <div className="panel-heading"><strong>Inspector</strong><Settings2 size={16} color="#64748b" /></div>
        <div className="inspector-empty"><div><Settings2 size={28} /><p>选择一个节点以编辑参数</p></div></div>
      </aside>
    )
  }
  const setConfig = (key: string, value: JsonValue): void => updateNode(node.id, { config: { ...node.data.config, [key]: value } })
  const type = node.data.nodeType
  const modelProvider = String(node.data.config['provider'] ?? '')
  const providerModels = modelsForProvider(modelCatalog, modelProvider)

  return (
    <aside className={`flow-panel inspector ${hidden ? 'mobile-hidden' : ''}`} aria-label="属性面板">
      <div className="panel-heading"><strong>Inspector</strong><span className="panel-kicker">{node.id}</span></div>
      <div className="inspector-scroll">
        <div className="inspector-node-head">
          <span className="inspector-node-icon" style={{ '--node-color': node.data.color } as CSSProperties}><NodeIcon name={node.data.icon} size={20} /></span>
          <span><strong>{node.data.label}</strong><small>{type}</small></span>
          <span className="inspector-actions">
            <button type="button" onClick={() => duplicateNode(node.id)} aria-label="复制节点" title="复制节点"><Copy size={14} /></button>
            <button type="button" className="danger" onClick={() => removeNode(node.id)} aria-label="删除节点" title="删除节点"><Trash2 size={14} /></button>
          </span>
        </div>
        <section className="form-section">
          <div className="form-section-title">General</div>
          <ConfigField label="显示名称" value={node.data.label} onChange={value => updateNode(node.id, { label: String(value) })} />
          <div className="field-row">
            <ConfigField label="Retry" type="number" value={node.data.config['retry'] ?? 0} onChange={value => setConfig('retry', value)} />
            <ConfigField label="Timeout (ms)" type="number" value={node.data.config['timeoutMs'] ?? 30000} onChange={value => setConfig('timeoutMs', value)} />
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-title">Configuration</div>
          {type === 'trigger.webhook' && <ConfigField label="Webhook Path" value={node.data.config['path']} onChange={value => setConfig('path', value)} />}
          {type === 'trigger.schedule' && <ConfigField label="Cron Expression" value={node.data.config['cron'] ?? '0 8 * * *'} onChange={value => setConfig('cron', value)} />}
          {type === 'http.request' && <>
            <label className="field"><span>Method</span><select value={String(node.data.config['method'] ?? 'GET')} onChange={event => setConfig('method', event.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option></select></label>
            <ConfigField label="URL" value={node.data.config['url']} onChange={value => setConfig('url', value)} />
          </>}
          {type === 'builtin.condition' && <>
            <ConfigField label="Input Path" value={node.data.config['path']} onChange={value => setConfig('path', value)} />
            <label className="field"><span>Operator</span><select value={String(node.data.config['operator'] ?? 'equals')} onChange={event => setConfig('operator', event.target.value)}><option value="equals">Equals</option><option value="notEquals">Not equals</option><option value="contains">Contains</option><option value="greaterThan">Greater than</option></select></label>
            <ConfigField label="Compare Value" value={node.data.config['value']} onChange={value => setConfig('value', value)} />
          </>}
          {type === 'dsh.agent' && <>
            <ConfigField label="Subagent Provider" value={node.data.config['subagentProvider']} onChange={value => setConfig('subagentProvider', value)} placeholder="spawn" />
            <ConfigField label="Model Provider" value={node.data.config['provider']} onChange={value => setConfig('provider', value)} list="dsh-flow-model-providers" placeholder="选择或输入 Provider ID" />
            <datalist id="dsh-flow-model-providers">
              {modelCatalog.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </datalist>
            <ConfigField label="Model ID" value={node.data.config['model']} onChange={value => setConfig('model', value)} list="dsh-flow-model-ids" placeholder="选择或输入 Model ID" />
            <datalist id="dsh-flow-model-ids">
              {providerModels.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
            </datalist>
            <div className={`model-catalog-note ${modelCatalog.status === 'error' ? 'is-error' : ''}`}>
              {modelCatalog.status === 'loading' && '正在从当前 DSH 会话加载模型目录…'}
              {modelCatalog.status === 'ready' && `${modelCatalog.groups.length} 个 Provider · ${modelCatalog.groups.reduce((count, group) => count + group.models.length, 0)} 个模型`}
              {modelCatalog.status === 'error' && `目录加载失败：${modelCatalog.error ?? '未知错误'}（仍可手工输入）`}
              {modelCatalog.status === 'idle' && '打开一个主会话后可加载模型目录；当前仍可手工输入。'}
              {modelCatalog.failures.length > 0 && ` · ${modelCatalog.failures.length} 个 Provider 加载失败`}
            </div>
            <div className="field-row">
              <ConfigField label="Max Tokens" type="number" value={node.data.config['maxTokens']} onChange={value => setConfig('maxTokens', value)} />
              <ConfigField label="Max Depth" type="number" value={node.data.config['maxDepth']} onChange={value => setConfig('maxDepth', value)} />
            </div>
            <label className="field"><span>Persona（可选）</span><textarea value={String(node.data.config['persona'] ?? '')} onChange={event => setConfig('persona', event.target.value)} /></label>
            <label className="field"><span>Prompt · 支持 {'{{input}}'}</span><textarea value={String(node.data.config['prompt'] ?? '')} onChange={event => setConfig('prompt', event.target.value)} /></label>
          </>}
          {type === 'script.javascript' && <>
            <ConfigField label="执行说明" value={node.data.config['description']} onChange={value => setConfig('description', value)} />
            <label className="field"><span>JavaScript · 可使用 input</span><textarea spellCheck={false} value={String(node.data.config['code'] ?? '')} onChange={event => setConfig('code', event.target.value)} /></label>
          </>}
          {type === 'storage.write' && <ConfigField label="Collection" value={node.data.config['collection']} onChange={value => setConfig('collection', value)} />}
          {!['trigger.webhook', 'trigger.schedule', 'http.request', 'builtin.condition', 'dsh.agent', 'script.javascript', 'storage.write'].includes(type) && <ConfigField label="Value" value={node.data.config['value']} onChange={value => setConfig('value', value)} />}
        </section>
        <button type="button" className="debug-button" onClick={() => void run(node.id)}><Play size={15} fill="currentColor" />调试此节点</button>
      </div>
    </aside>
  )
}

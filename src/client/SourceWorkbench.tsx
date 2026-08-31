import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, Code2, FileCode2, LoaderCircle, Plus, Save, X } from 'lucide-react'
import type { RunFlowPluginSource, RunFlowPluginSourceKind } from '../plugin-sources.ts'
import { LightCodeEditor } from './LightCodeEditor.tsx'
import { getFlowRuntime, useFlowRuntime } from './runtime.ts'
import { useFlowStore } from './store.ts'

function template(kind: RunFlowPluginSourceKind, type: string): string {
  if (kind === 'node') return `import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  inject: ['agents', 'llm'],
  node: {
    type: '${type}',
    title: 'Custom Node',
    description: 'Trusted Cordis Node plugin.',
    category: 'action',
    color: '#4F7CFF',
    icon: 'braces',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [{ id: 'output', label: 'output', type: 'json' }],
  },
  async execute(ctx, execution) {
    execution.log('Running custom Node through live Host ctx')
    return { input: execution.input, liveAgents: ctx.agents.list().length }
  },
})
`
  return `import { defineRunFlowScriptPlugin } from 'dsh-runflow'

export default defineRunFlowScriptPlugin({
  inject: ['flowScript'],
  node: {
    type: '${type}',
    title: 'Custom Script',
    description: 'Trusted Cordis Script plugin.',
    category: 'action',
    color: '#4F7CFF',
    icon: 'square-code',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [{ id: 'output', label: 'output', type: 'json' }],
  },
  async execute(ctx, execution) {
    execution.log('Script plugin can call ctx.flowScript and other Host services')
    return { input: execution.input, channelDepth: ctx.flowScript.channel.list().length }
  },
})
`
}

export function SourceWorkbench() {
  const open = useFlowStore(state => state.sourceWorkbenchOpen)
  const setOpen = useFlowStore(state => state.setSourceWorkbenchOpen)
  const capabilities = useFlowStore(state => state.capabilities)
  const refreshWorkspace = useFlowStore(state => state.refreshWorkspace)
  const runtimeSnapshot = useFlowRuntime()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [sources, setSources] = useState<RunFlowPluginSource[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [name, setName] = useState('')
  const [kind, setKind] = useState<RunFlowPluginSourceKind>('node')
  const [content, setContent] = useState('')
  const [savedVersion, setSavedVersion] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const selected = useMemo(() => sources.find(source => source.kind + ':' + source.name === selectedKey), [selectedKey, sources])
  const dirty = selected === undefined ? content.trim().length > 0 : content !== selected.content || name !== selected.name || kind !== selected.kind

  const choose = (source: RunFlowPluginSource): void => {
    setSelectedKey(source.kind + ':' + source.name)
    setName(source.name)
    setKind(source.kind)
    setContent(source.content)
    setSavedVersion(source.version)
    setError(undefined)
  }
  const load = async (): Promise<void> => {
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    if (runtime === undefined || agentId === undefined) return
    setLoading(true); setError(undefined)
    try {
      const next = await runtime.sources(agentId)
      setSources(next)
      const current = next.find(source => source.kind + ':' + source.name === selectedKey) ?? next[0]
      if (current !== undefined) choose(current)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally { setLoading(false) }
  }
  useEffect(() => {
    if (!open) return
    void load()
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null

  const create = (nextKind: RunFlowPluginSourceKind): void => {
    const stamp = Date.now().toString(36)
    const nextName = `custom-${stamp}.${nextKind}.ts`
    const type = `local.custom-${stamp}`
    setSelectedKey('')
    setKind(nextKind)
    setName(nextName)
    setContent(template(nextKind, type))
    setSavedVersion('')
    setError(undefined)
  }
  const save = async (): Promise<void> => {
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    if (runtime === undefined || agentId === undefined) { setError('请先打开 DSH 主会话'); return }
    setSaving(true); setError(undefined)
    try {
      const saved = await runtime.saveSource(agentId, { kind, name, content })
      setSources(current => [saved, ...current.filter(source => source.kind + ':' + source.name !== saved.kind + ':' + saved.name)])
      choose(saved)
      await new Promise(resolve => window.setTimeout(resolve, 260))
      await refreshWorkspace()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally { setSaving(false) }
  }

  return <div className="source-workbench-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
    <section className="source-workbench" role="dialog" aria-modal="true" aria-label="Node 与 Script 开发台">
      <header>
        <span className="source-workbench-title"><Code2 size={18} /><span><strong>Node / Script Workbench</strong><small>保存后由 Host watcher 自动重载</small></span></span>
        <span className="source-workbench-capabilities">
          <em className={capabilities.runCode ? 'ok' : 'warn'}>{capabilities.runCode ? 'run_code ready' : 'run_code unavailable'}</em>
          <em>{runtimeSnapshot.sessionId === undefined ? 'Host offline' : 'creation mode'}</em>
        </span>
        <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="关闭开发台"><X size={17} /></button>
      </header>
      <div className="source-workbench-body">
        <aside>
          <div className="source-new-actions"><button onClick={() => create('node')}><Plus size={13} />Node</button><button onClick={() => create('script')}><Plus size={13} />Script</button></div>
          <div className="source-file-list" aria-busy={loading}>
            {loading && <span className="source-loading"><LoaderCircle className="flow-spin" size={15} />加载 Host 文件…</span>}
            {sources.map(source => <button className={selectedKey === source.kind + ':' + source.name ? 'selected' : ''} key={source.kind + ':' + source.name} onClick={() => choose(source)}>
              <FileCode2 size={15} /><span><strong>{source.name}</strong><small>{source.kind} · {source.version.slice(0, 8)}</small></span>
            </button>)}
          </div>
        </aside>
        <main>
          {!capabilities.sourceAuthoring ? <div className="source-locked"><CircleAlert size={24} /><strong>仅创造模式可编辑可信 Host 源码</strong><span>切换 DSH 会话预设为“创造模式”后重新打开开发台。</span></div> : <>
            <div className="source-meta-row">
              <label><span>Kind</span><select value={kind} onChange={event => setKind(event.target.value as RunFlowPluginSourceKind)}><option value="node">Node</option><option value="script">Script</option></select></label>
              <label><span>File name</span><input value={name} onChange={event => setName(event.target.value)} /></label>
              <button className="source-save" onClick={() => void save()} disabled={saving || !dirty || name.trim() === ''}><Save size={14} />{saving ? 'Saving…' : 'Save & reload'}</button>
            </div>
            {error !== undefined && <div className="source-error" role="alert"><CircleAlert size={14} />{error}</div>}
            <LightCodeEditor profile={kind === 'node' ? 'cordis-node' : 'cordis-script'} label={kind === 'node' ? 'Cordis Node source' : 'Cordis Script source'} minRows={20} value={content} onChange={setContent} />
            <footer><span>{dirty ? '未保存修改' : savedVersion === '' ? '新文件' : '已保存 · ' + savedVersion.slice(0, 12)}</span><span>ctx / execution 输入“.”或按 Ctrl+Space 查看补全</span></footer>
          </>}
        </main>
      </div>
    </section>
  </div>
}

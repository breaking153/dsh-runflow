import { useMemo, useState } from 'react'
import { Boxes, Plus, Search, Trash2, X } from 'lucide-react'
import { readGraphFragment } from './graph-editing.ts'
import { useFlowStore } from './store.ts'
import { loadWorkflowTemplates, makeWorkflowTemplate, persistWorkflowTemplates } from './workflow-templates.ts'
import { useDialogFocus } from './use-dialog-focus.ts'
import { useRunFlowLocale } from './locale.ts'

export function TemplateBrowser({ open, onClose }: { open: boolean; onClose(): void }) {
  return open ? <TemplateBrowserContent onClose={onClose} /> : null
}

function TemplateBrowserContent({ onClose }: { onClose(): void }) {
  const { t } = useRunFlowLocale()
  const dialogRef = useDialogFocus(true, onClose)
  const nodes = useFlowStore(state => state.nodes)
  const edges = useFlowStore(state => state.edges)
  const selectedNodeId = useFlowStore(state => state.selectedNodeId)
  const pasteSelection = useFlowStore(state => state.pasteSelection)
  const [templates, setTemplates] = useState(loadWorkflowTemplates)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [saveError, setSaveError] = useState(false)
  const fragment = useMemo(() => readGraphFragment(nodes, edges, selectedNodeId), [edges, nodes, selectedNodeId])
  const visible = templates.filter(template => `${template.name} ${template.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  const replace = (next: typeof templates): boolean => {
    try {
      persistWorkflowTemplates(next)
      setTemplates(next)
      setSaveError(false)
      return true
    } catch {
      setSaveError(true)
      return false
    }
  }
  return <div className="template-browser-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} className="template-browser" role="dialog" aria-modal="true" aria-label={t('workflowTemplates')}>
      <header><span><Boxes size={18} /><span><strong>{t('workflowTemplates')}</strong><small>{t('templateIntro')}</small></span></span><button onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>
      <div className="template-browser-create">
        <input value={name} onChange={event => setName(event.target.value)} placeholder={t('templateName')} aria-label={t('templateName')} />
        <button disabled={fragment.nodes.length === 0} onClick={() => { const template = makeWorkflowTemplate(name, fragment); if (replace([template, ...templates])) setName('') }}><Plus size={14} />{t('saveSelection')}</button>
        <span>{fragment.nodes.length === 0 ? t('selectTemplateNodes') : t('templateContents', { nodes: fragment.nodes.length, edges: fragment.edges.length })}</span>
      </div>
      {saveError && <p className="template-save-error" role="alert">{t('templateSaveError')}</p>}
      <label className="template-search"><Search size={14} /><input data-dialog-autofocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchTemplates')} aria-label={t('searchTemplates')} /></label>
      <div className="template-grid">
        {visible.map(template => <article key={template.id}>
          <span><Boxes size={18} /><em>{template.fragment.nodes.length}</em></span>
          <h3>{template.name}</h3><p>{template.description || t('templateContents', { nodes: template.fragment.nodes.length, edges: template.fragment.edges.length })}</p>
          <footer><button onClick={() => { useFlowStore.setState({ graphClipboard: structuredClone(template.fragment) }); pasteSelection(); onClose() }}><Plus size={13} />{t('insertTemplate')}</button><button onClick={() => replace(templates.filter(item => item.id !== template.id))} aria-label={`${t('delete')} ${template.name}`}><Trash2 size={13} /></button></footer>
        </article>)}
        {visible.length === 0 && <div className="template-empty"><Boxes size={26} /><strong>{t(templates.length === 0 ? 'noTemplates' : 'noMatchingTemplates')}</strong><span>{t(templates.length === 0 ? 'noTemplatesHint' : 'noMatchingTemplatesHint')}</span></div>}
      </div>
    </section>
  </div>
}

import { Activity, GitCompareArrows, Settings2 } from 'lucide-react'
import { PropertyInspector } from './Panels.tsx'
import { ReviewPanel } from './ReviewPanel.tsx'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore } from './store.ts'
import { selectInspectorTab } from './state/selectors.ts'
import type { InspectorTab } from './state/store-types.ts'

function ExecutionEvidencePanel() {
  const { t } = useRunFlowLocale()
  const selectedNodeId = useFlowStore(state => state.selectedNodeId)
  const selectedExecutionId = useFlowStore(state => state.selectedExecutionId)
  const node = useFlowStore(state => state.nodes.find(item => item.id === selectedNodeId))
  const execution = useFlowStore(state => state.executions.find(item => item.id === selectedExecutionId))
  const openNodeDetails = useFlowStore(state => state.openNodeDetails)
  const record = node?.data.executionRecord
    ?? execution?.nodes.find(item => item.nodeId === selectedNodeId)
  const output = record?.outputPorts ?? record?.output ?? execution?.output

  if (record === undefined && execution === undefined) {
    return <div className="context-empty"><Activity size={24} /><strong>{t('noExecutionEvidence')}</strong><span>{t('noExecutionEvidenceHint')}</span></div>
  }
  return <div className="execution-evidence">
    <header><span><strong>{t('executionOutput')}</strong><small>{record?.nodeId ?? execution?.id}</small></span><em className={'status-' + String(record?.status ?? execution?.status).toLowerCase()}>{record?.status ?? execution?.status}</em></header>
    {record?.error !== undefined && <div className="evidence-error" role="alert">{record.error}</div>}
    <pre>{JSON.stringify(output ?? null, null, 2)}</pre>
    {record !== undefined && node !== undefined && <button type="button" onClick={() => openNodeDetails(node.id, undefined, execution?.id)}>{t('openExecutionDetails')}</button>}
  </div>
}

export function InspectorPanel({ onClose }: { onClose?(): void }) {
  const { t } = useRunFlowLocale()
  const active = useFlowStore(selectInspectorTab) ?? 'parameters'
  const setActive = useFlowStore(state => state.setInspectorTab)
  const review = useFlowStore(state => state.review)
  const selectedNode = useFlowStore(state => state.nodes.find(item => item.id === state.selectedNodeId))
  const selectedExecution = useFlowStore(state => state.executions.find(item => item.id === state.selectedExecutionId))
  const hasExecution = selectedNode?.data.executionRecord !== undefined || selectedExecution !== undefined
  const tabs: { id: InspectorTab; label: string; icon: typeof GitCompareArrows; disabled: boolean }[] = [
    { id: 'review', label: t('review'), icon: GitCompareArrows, disabled: review === undefined },
    { id: 'parameters', label: t('parameters'), icon: Settings2, disabled: selectedNode === undefined },
    { id: 'execution', label: t('execution'), icon: Activity, disabled: !hasExecution },
  ]

  return <aside className="flow-panel inspector contextual-inspector" aria-label={t('inspector')}>
    <div className="contextual-inspector-heading"><span><strong>{t('inspector')}</strong><small>{t('inspectorContextHint')}</small></span>{onClose !== undefined && <button type="button" onClick={onClose} aria-label={t('closeInspector')}>×</button>}</div>
    <nav className="contextual-tabs" aria-label={t('inspector')}>
      {tabs.map(tab => <button key={tab.id} type="button" className={active === tab.id ? 'active' : ''} disabled={tab.disabled} onClick={() => setActive(tab.id)}><tab.icon size={13} />{tab.label}</button>)}
    </nav>
    <div className="contextual-body">
      {active === 'review' && <ReviewPanel />}
      {active === 'parameters' && <PropertyInspector showOutputTab={false} {...(onClose === undefined ? {} : { onClose })} />}
      {active === 'execution' && <ExecutionEvidencePanel />}
    </div>
  </aside>
}

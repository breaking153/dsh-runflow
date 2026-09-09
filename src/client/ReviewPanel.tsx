import { AlertTriangle, Bot, Check, GitCompareArrows, X } from 'lucide-react'
import { useMemo } from 'react'
import { useRunFlowLocale } from './locale.ts'
import { useFlowStore } from './store.ts'
import { selectReviewSummary } from './state/selectors.ts'

const changeNodeId = (kind: string, subjectId: string): string | undefined =>
  kind.startsWith('node.') ? subjectId : undefined

export function ReviewPanel() {
  const { language, t } = useRunFlowLocale()
  const review = useFlowStore(state => state.review)
  const summary = useMemo(() => selectReviewSummary({ review }), [review])
  const selectNode = useFlowStore(state => state.selectNode)
  const acceptReview = useFlowStore(state => state.acceptReview)
  const dismissReview = useFlowStore(state => state.dismissReview)
  const clearReview = useFlowStore(state => state.clearReview)

  if (review === undefined) {
    return <div className="context-empty"><GitCompareArrows size={24} /><strong>{t('noReview')}</strong><span>{t('noReviewHint')}</span></div>
  }

  const status = review.status === 'pending'
    ? t('awaitingReview')
    : review.status === 'edited'
      ? t('reviewEdited')
      : review.status === 'accepted'
        ? t('reviewAccepted')
        : t('reviewDismissed')
  const changeLabel = (kind: string): string => {
    const labels = language === 'zh'
      ? { 'workflow.changed': '工作流设置', 'node.added': '新增节点', 'node.changed': '修改节点', 'node.removed': '移除节点', 'edge.added': '新增连接', 'edge.removed': '移除连接' }
      : { 'workflow.changed': 'Workflow setting', 'node.added': 'Node added', 'node.changed': 'Node changed', 'node.removed': 'Node removed', 'edge.added': 'Connection added', 'edge.removed': 'Connection removed' }
    return labels[kind as keyof typeof labels] ?? kind
  }

  return <div className="review-panel">
    <header className="review-lead">
      <span className="review-origin"><Bot size={15} /></span>
      <span><strong>{t('reviewDraftTitle')}</strong><small>{t('reviewDraftHint')}</small></span>
      <em className={'review-status status-' + review.status}>{status}</em>
    </header>
    <div className="review-summary" aria-label={t('reviewSummary')}>
      <span><strong>{summary.additions}</strong>{t('additions')}</span>
      <span><strong>{summary.changes}</strong>{t('changes')}</span>
      <span><strong>{summary.removals}</strong>{t('removals')}</span>
      <span className={summary.errors > 0 ? 'has-errors' : ''}><strong>{summary.errors}</strong>{t('errors')}</span>
    </div>
    {review.diagnostics.length > 0 && <section className="review-diagnostics" aria-label={t('diagnostics')}>
      <h3>{t('diagnostics')}</h3>
      {review.diagnostics.map((diagnostic, index) => <button
        key={diagnostic.code + ':' + String(index)}
        type="button"
        className={'diagnostic-row severity-' + diagnostic.severity}
        onClick={() => diagnostic.nodeId === undefined ? undefined : selectNode(diagnostic.nodeId)}
        role={diagnostic.severity === 'error' ? 'alert' : undefined}
      >
        <AlertTriangle size={13} />
        <span><strong>{diagnostic.code}</strong><small>{diagnostic.message}</small></span>
      </button>)}
    </section>}
    <section className="review-changes" aria-label={t('reviewChanges')}>
      <h3>{t('reviewChanges')}<span>{review.changes.length}</span></h3>
      {review.changes.length === 0
        ? <p>{t('noReviewChanges')}</p>
        : review.changes.map(change => <button
            key={change.id}
            type="button"
            onClick={() => {
              const nodeId = changeNodeId(change.kind, change.subjectId)
              if (nodeId !== undefined) selectNode(nodeId)
            }}
          >
            <span className={'change-mark ' + change.kind.replace('.', '-')}>{change.kind.endsWith('removed') ? '−' : change.kind.endsWith('added') ? '+' : '·'}</span>
            <span><strong>{changeLabel(change.kind)}</strong><small>{change.subjectId}</small></span>
          </button>)}
    </section>
    <footer className="review-actions">
      {review.status === 'pending' || review.status === 'edited'
        ? <><button type="button" className="review-secondary" onClick={dismissReview}><X size={13} />{t('dismissReview')}</button><button type="button" className="review-primary" onClick={() => acceptReview()}><Check size={13} />{t('acceptDraft')}</button></>
        : <button type="button" className="review-secondary" onClick={clearReview}>{t('clearReview')}</button>}
    </footer>
  </div>
}

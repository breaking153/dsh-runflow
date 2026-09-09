import type { WorkflowReviewSession } from '../application/workflow-review.ts'
import type { InspectorTab, ReviewSummary } from './store-types.ts'

interface InspectorSelectionState {
  inspectorTab: InspectorTab | undefined
  review: WorkflowReviewSession | undefined
  detailsNodeId: string | undefined
  selectedExecutionId: string | undefined
  selectedNodeId: string | undefined
}

export function selectInspectorTab(state: InspectorSelectionState): InspectorTab | undefined {
  if (state.inspectorTab !== undefined) return state.inspectorTab
  if (state.review?.status === 'pending' || state.review?.status === 'edited') return 'review'
  if (state.detailsNodeId !== undefined) return 'execution'
  if (state.selectedNodeId !== undefined) return 'parameters'
  if (state.selectedExecutionId !== undefined) return 'execution'
  return undefined
}

export function selectReviewSummary(state: { review: WorkflowReviewSession | undefined }): ReviewSummary {
  const changes = state.review?.changes ?? []
  return {
    additions: changes.filter(change => change.kind.endsWith('.added')).length,
    removals: changes.filter(change => change.kind.endsWith('.removed')).length,
    changes: changes.filter(change => change.kind.endsWith('.changed')).length,
    errors: state.review?.diagnostics.filter(item => item.severity === 'error').length ?? 0,
  }
}

export const selectCurrentReview = (state: { review: WorkflowReviewSession | undefined }) => state.review
export const selectSelectedNodeId = (state: { selectedNodeId: string | undefined }) => state.selectedNodeId
export const selectSelectedExecutionId = (state: { selectedExecutionId: string | undefined }) => state.selectedExecutionId

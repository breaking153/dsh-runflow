import {
  acceptWorkflowReview,
  markReviewEdited,
  type WorkflowReviewSession,
} from '../application/workflow-review.ts'
import type { InspectorTab } from './store-types.ts'

export interface ReviewSlice {
  review: WorkflowReviewSession | undefined
  inspectorTab: InspectorTab | undefined
  setInspectorTab(tab: InspectorTab | undefined): void
  acceptReview(acceptedAt?: string): void
  dismissReview(): void
  clearReview(): void
}

export function editedReview(review: WorkflowReviewSession | undefined): WorkflowReviewSession | undefined {
  return review === undefined ? undefined : markReviewEdited(review)
}

export interface ReviewSliceUpdate {
  review?: WorkflowReviewSession | undefined
  inspectorTab?: InspectorTab | undefined
}

export type ReviewSliceSetter = (
  update: ReviewSliceUpdate | ((state: ReviewSlice) => ReviewSliceUpdate),
) => void

export function createReviewSlice(set: ReviewSliceSetter): ReviewSlice {
  return {
  review: undefined,
  inspectorTab: undefined,
  setInspectorTab(inspectorTab) { set({ inspectorTab }) },
  acceptReview(acceptedAt) {
    set(state => state.review === undefined
      ? {}
      : { review: acceptWorkflowReview(state.review, acceptedAt), inspectorTab: 'review' })
  },
  dismissReview() {
    set(state => state.review === undefined
      ? {}
      : { review: { ...structuredClone(state.review), status: 'dismissed' }, inspectorTab: undefined })
  },
  clearReview() { set({ review: undefined, inspectorTab: undefined }) },
  }
}

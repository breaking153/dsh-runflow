export type InspectorTab = 'review' | 'parameters' | 'execution'

export interface ReviewSummary {
  additions: number
  removals: number
  changes: number
  errors: number
}

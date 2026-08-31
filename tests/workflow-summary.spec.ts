import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import { latestExecutionFor, workflowTriggerSummary } from '../src/client/workflow-summary.ts'

const workflow = (type: string, config: Record<string, string> = {}): WorkflowDefinition => ({
  id: 'flow', name: 'Flow', version: 1, edges: [],
  nodes: [{ id: 'trigger', type, config }],
})

describe('workflow sidebar summaries', () => {
  it('describes trigger configuration without inventing a schedule', () => {
    expect(workflowTriggerSummary(workflow('trigger.manual'))).toEqual({ label: 'Manual', detail: '按需手动执行' })
    expect(workflowTriggerSummary(workflow('trigger.schedule', { cron: '0 8 * * *' }))).toEqual({ label: 'Schedule', detail: '0 8 * * *' })
    expect(workflowTriggerSummary(workflow('trigger.webhook', { path: '/review' }))).toEqual({ label: 'Webhook', detail: '/review' })
  })

  it('selects the newest execution even when history is unordered', () => {
    const records: WorkflowExecution[] = [
      { id: 'old', workflowId: 'flow', version: 1, status: 'SUCCESS', trigger: 'ui', startedAt: '2026-08-28T10:00:00.000Z', nodes: [] },
      { id: 'other', workflowId: 'other', version: 1, status: 'FAILED', trigger: 'ui', startedAt: '2026-08-30T10:00:00.000Z', nodes: [] },
      { id: 'new', workflowId: 'flow', version: 1, status: 'FAILED', trigger: 'ui', startedAt: '2026-08-29T10:00:00.000Z', nodes: [] },
    ]
    expect(latestExecutionFor('flow', records)?.id).toBe('new')
  })
})

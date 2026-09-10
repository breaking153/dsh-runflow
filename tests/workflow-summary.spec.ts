import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import { executionStatusLabel, latestExecutionFor, workflowTriggerSummary } from '../src/client/workflow-summary.ts'

const workflow = (type: string, config: Record<string, string> = {}): WorkflowDefinition => ({
  id: 'flow', name: 'Flow', version: 1, edges: [],
  nodes: [{ id: 'trigger', type, config }],
})

describe('workflow sidebar summaries', () => {
  it('describes trigger configuration without inventing a schedule', () => {
    expect(workflowTriggerSummary(workflow('trigger.manual'))).toEqual({ label: 'Manual', detail: '按需手动执行' })
    expect(workflowTriggerSummary(workflow('trigger.schedule', { cron: '0 8 * * *' }))).toEqual({ label: 'Schedule', detail: '0 8 * * *' })
    expect(workflowTriggerSummary(workflow('trigger.webhook', { path: '/review' }))).toEqual({ label: 'Webhook', detail: '在节点面板管理绑定' })
  })

  it('identifies Agent inputs, multiple trigger entries, and paused executions', () => {
    expect(workflowTriggerSummary(workflow('trigger.agent'), 'en')).toEqual({ label: 'Agent input', detail: 'Triggered by an AI Agent tool' })
    const multiple = workflow('trigger.manual')
    multiple.nodes.push({ id: 'agent', type: 'trigger.agent', name: 'Agent input', config: {} }, { id: 'hook', type: 'trigger.webhook', config: {} })
    expect(workflowTriggerSummary(multiple, 'en')).toEqual({ label: '3 trigger entries', detail: 'manual · Agent input · webhook' })
    expect(executionStatusLabel('PAUSED')).toBe('已暂停')
    expect(executionStatusLabel('PAUSED', 'en')).toBe('Paused')
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

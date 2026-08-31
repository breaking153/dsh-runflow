import type { WorkflowDefinition, WorkflowExecution } from '../contracts.ts'

export interface WorkflowTriggerSummary {
  label: string
  detail: string
}

export function latestExecutionFor(workflowId: string, executions: WorkflowExecution[]): WorkflowExecution | undefined {
  return executions
    .filter(execution => execution.workflowId === workflowId)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0]
}

export function workflowTriggerSummary(workflow: WorkflowDefinition): WorkflowTriggerSummary {
  const trigger = workflow.nodes.find(node => node.type.startsWith('trigger.'))
  if (trigger === undefined) return { label: 'No trigger', detail: '尚未配置触发器' }
  if (trigger.type === 'trigger.manual') return { label: trigger.name ?? 'Manual', detail: '按需手动执行' }
  if (trigger.type === 'trigger.schedule') {
    const cron = typeof trigger.config['cron'] === 'string' ? trigger.config['cron'] : '未配置计划'
    return { label: trigger.name ?? 'Schedule', detail: cron }
  }
  if (trigger.type === 'trigger.webhook') {
    const path = typeof trigger.config['path'] === 'string' ? trigger.config['path'] : '未配置路径'
    return { label: trigger.name ?? 'Webhook', detail: path }
  }
  if (trigger.type === 'trigger.dsh-event') {
    const event = typeof trigger.config['event'] === 'string' ? trigger.config['event'] : '等待 DSH Event'
    return { label: trigger.name ?? 'DSH Event', detail: event }
  }
  return { label: trigger.name ?? trigger.type, detail: trigger.type }
}

export function executionStatusLabel(status?: WorkflowExecution['status']): string {
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'RUNNING') return '执行中'
  if (status === 'PENDING') return '排队中'
  if (status === 'CANCELLED') return '已取消'
  return '未执行'
}

export function compactExecutionTime(value?: string): string {
  if (value === undefined) return '尚未触发'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return '今天 ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

import type { WorkflowDefinition, WorkflowExecution } from '../contracts.ts'
import type { RunFlowLanguage } from './locale.ts'

export interface WorkflowTriggerSummary {
  label: string
  detail: string
}

export function latestExecutionFor(workflowId: string, executions: WorkflowExecution[]): WorkflowExecution | undefined {
  return executions
    .filter(execution => execution.workflowId === workflowId)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0]
}

export function workflowTriggerSummary(workflow: WorkflowDefinition, language: RunFlowLanguage = 'zh'): WorkflowTriggerSummary {
  const trigger = workflow.nodes.find(node => node.type.startsWith('trigger.'))
  if (trigger === undefined) return { label: 'No trigger', detail: language === 'zh' ? '尚未配置触发器' : 'Trigger not configured' }
  if (trigger.type === 'trigger.manual') return { label: trigger.name ?? 'Manual', detail: language === 'zh' ? '按需手动执行' : 'Run on demand' }
  if (trigger.type === 'trigger.schedule') {
    const cron = typeof trigger.config['cron'] === 'string' ? trigger.config['cron'] : language === 'zh' ? '未配置计划' : 'Schedule not configured'
    return { label: trigger.name ?? 'Schedule', detail: cron }
  }
  if (trigger.type === 'trigger.webhook') {
    const path = typeof trigger.config['path'] === 'string' ? trigger.config['path'] : language === 'zh' ? '未配置路径' : 'Path not configured'
    return { label: trigger.name ?? 'Webhook', detail: path }
  }
  if (trigger.type === 'trigger.dsh-event') {
    const event = typeof trigger.config['event'] === 'string' ? trigger.config['event'] : language === 'zh' ? '等待 DSH Event' : 'Waiting for DSH Event'
    return { label: trigger.name ?? 'DSH Event', detail: event }
  }
  return { label: trigger.name ?? trigger.type, detail: trigger.type }
}

export function executionStatusLabel(status?: WorkflowExecution['status'], language: RunFlowLanguage = 'zh'): string {
  if (language === 'en') return status === 'SUCCESS' ? 'Success' : status === 'FAILED' ? 'Failed' : status === 'RUNNING' ? 'Running' : status === 'PENDING' ? 'Queued' : status === 'CANCELLED' ? 'Cancelled' : 'Not run'
  if (status === 'SUCCESS') return '成功'
  if (status === 'FAILED') return '失败'
  if (status === 'RUNNING') return '执行中'
  if (status === 'PENDING') return '排队中'
  if (status === 'CANCELLED') return '已取消'
  return '未执行'
}

export function compactExecutionTime(value?: string, language: RunFlowLanguage = 'zh'): string {
  if (value === undefined) return language === 'zh' ? '尚未触发' : 'Never triggered'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return (language === 'zh' ? '今天 ' : 'Today ') + date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })
  }
  const locale = language === 'zh' ? 'zh-CN' : 'en-US'
  return date.toLocaleDateString(locale, { month: '2-digit', day: '2-digit' }) + ' ' + date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

import type { LucideIcon } from 'lucide-react'
import {
  Bot, Braces, Clock3, Database, GitBranch, Globe2, ListPlus,
  MousePointerClick, Radio, SquareCode, Webhook,
} from 'lucide-react'
import type { WorkflowNodeDescriptor } from '../contracts.ts'

export const NODE_CATALOG: WorkflowNodeDescriptor[] = [
  { type: 'trigger.manual', title: 'Manual Trigger', description: '手动启动工作流', category: 'trigger', color: '#22c55e', icon: 'mouse-pointer-click' },
  { type: 'trigger.webhook', title: 'Webhook', description: '接收外部 HTTP 请求', category: 'trigger', color: '#22c55e', icon: 'webhook' },
  { type: 'trigger.schedule', title: 'Schedule', description: 'Cron 定时触发', category: 'trigger', color: '#22c55e', icon: 'clock-3' },
  { type: 'trigger.dsh-event', title: 'DSH Event', description: '监听 Cordis / DSH 事件', category: 'trigger', color: '#22c55e', icon: 'radio' },
  { type: 'http.request', title: 'HTTP Request', description: '调用远程 HTTP API', category: 'action', color: '#fb923c', icon: 'globe-2' },
  { type: 'script.javascript', title: 'JavaScript', description: '通过 DSH run_code 执行脚本', category: 'action', color: '#facc15', icon: 'square-code', available: true },
  { type: 'builtin.condition', title: 'Condition', description: '按条件分支数据', category: 'logic', color: '#a78bfa', icon: 'git-branch' },
  { type: 'builtin.set', title: 'Set Fields', description: '设置或转换字段', category: 'logic', color: '#38bdf8', icon: 'list-plus' },
  { type: 'dsh.agent', title: 'DSH Agent', description: '调用 Harness 原生 Subagent', category: 'ai', color: '#60a5fa', icon: 'bot', available: true },
  { type: 'dsh.llm', title: 'LLM', description: '调用宿主大模型能力', category: 'ai', color: '#818cf8', icon: 'braces', available: false },
  { type: 'storage.write', title: 'Storage', description: '持久化节点输出', category: 'data', color: '#2dd4bf', icon: 'database' },
]

export const CATEGORY_LABELS = {
  trigger: '触发器',
  action: '操作',
  logic: '逻辑',
  ai: 'AI 能力',
  data: '数据',
} as const

const ICONS: Record<string, LucideIcon> = {
  'mouse-pointer-click': MousePointerClick,
  webhook: Webhook,
  'clock-3': Clock3,
  radio: Radio,
  'globe-2': Globe2,
  'square-code': SquareCode,
  'git-branch': GitBranch,
  'list-plus': ListPlus,
  bot: Bot,
  braces: Braces,
  database: Database,
}

export function NodeIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Braces
  return <Icon size={size} strokeWidth={1.9} />
}

export function descriptorFor(type: string): WorkflowNodeDescriptor {
  return NODE_CATALOG.find(item => item.type === type) ?? {
    type,
    title: type,
    description: '第三方 Cordis Node Provider',
    category: 'action',
    color: '#94a3b8',
    icon: 'braces',
  }
}

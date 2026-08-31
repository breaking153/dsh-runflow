import type { LucideIcon } from 'lucide-react'
import {
  Bot, Braces, Clock3, Database, GitBranch, Globe2, ListPlus,
  MousePointerClick, Radio, SquareCode, Webhook,
} from 'lucide-react'
import type { WorkflowNodeDescriptor } from '../contracts.ts'

const anyInput = [{ id: 'input', label: 'input', type: 'any' as const }]
const anyOutput = [{ id: 'output', label: 'output', type: 'any' as const }]
const triggerOutput = [{ id: 'output', label: 'event', type: 'json' as const }]

export const NODE_CATALOG: WorkflowNodeDescriptor[] = [
  { type: 'trigger.manual', title: 'Manual Trigger', description: '手动启动工作流', category: 'trigger', color: '#22c55e', icon: 'mouse-pointer-click', inputs: [], outputs: triggerOutput },
  { type: 'trigger.webhook', title: 'Webhook', description: 'Host 监听器尚未安装', category: 'trigger', color: '#22c55e', icon: 'webhook', available: false, inputs: [], outputs: triggerOutput },
  { type: 'trigger.schedule', title: 'Schedule', description: 'Host Cron 监听器尚未安装', category: 'trigger', color: '#22c55e', icon: 'clock-3', available: false, inputs: [], outputs: triggerOutput },
  { type: 'trigger.dsh-event', title: 'DSH Event', description: 'Host 事件订阅器尚未安装', category: 'trigger', color: '#22c55e', icon: 'radio', available: false, inputs: [], outputs: triggerOutput },
  {
    type: 'http.request',
    title: 'HTTP Request',
    description: '调用远程 HTTP API',
    category: 'action',
    color: '#fb923c',
    icon: 'globe-2',
    inputs: anyInput,
    outputs: [
      { id: 'body', label: 'body', type: 'any' },
      { id: 'status', label: 'status', type: 'number' },
      { id: 'headers', label: 'headers', type: 'json' },
    ],
  },
  { type: 'script.javascript', title: 'JavaScript', description: '通过 DSH run_code 执行脚本', category: 'action', color: '#facc15', icon: 'square-code', available: true, inputs: anyInput, outputs: anyOutput },
  {
    type: 'builtin.condition',
    title: 'Condition',
    description: '按条件分支数据',
    category: 'logic',
    color: '#a78bfa',
    icon: 'git-branch',
    inputs: anyInput,
    outputs: [
      { id: 'value', label: 'value', type: 'any' },
      { id: 'matched', label: 'matched', type: 'boolean' },
    ],
  },
  { type: 'builtin.set', title: 'Set Fields', description: '设置或转换字段', category: 'logic', color: '#38bdf8', icon: 'list-plus', inputs: [{ id: 'input', type: 'json' }], outputs: [{ id: 'output', type: 'json' }] },
  { type: 'dsh.agent', title: 'DSH Agent', description: '调用 Harness 原生 Subagent', category: 'ai', color: '#60a5fa', icon: 'bot', available: true, inputs: anyInput, outputs: [{ id: 'result', label: 'result', type: 'json' }] },
  { type: 'dsh.llm', title: 'LLM', description: '调用宿主大模型能力', category: 'ai', color: '#818cf8', icon: 'braces', available: false, inputs: anyInput, outputs: [{ id: 'text', type: 'text' }, { id: 'usage', type: 'json' }] },
  { type: 'storage.write', title: 'Storage', description: '写入本次 Host 执行产物', category: 'data', color: '#2dd4bf', icon: 'database', inputs: anyInput, outputs: [{ id: 'output', type: 'json' }] },
]

let hostCatalog: WorkflowNodeDescriptor[] = []

export function mergeNodeCatalog(nodes: readonly WorkflowNodeDescriptor[]): WorkflowNodeDescriptor[] {
  const byType = new Map(NODE_CATALOG.map(item => [item.type, item]))
  for (const node of nodes) byType.set(node.type, structuredClone(node))
  return [...byType.values()]
}

export function setHostNodeCatalog(nodes: readonly WorkflowNodeDescriptor[]): WorkflowNodeDescriptor[] {
  hostCatalog = nodes.map(node => structuredClone(node))
  return mergeNodeCatalog(hostCatalog)
}

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
  return hostCatalog.find(item => item.type === type) ?? NODE_CATALOG.find(item => item.type === type) ?? {
    type,
    title: type,
    description: '第三方 Cordis Node Provider',
    category: 'action',
    color: '#94a3b8',
    icon: 'braces',
    inputs: anyInput,
    outputs: anyOutput,
  }
}

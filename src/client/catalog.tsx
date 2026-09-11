import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownUp, Bot, Braces, CalendarClock, CircleStop, Clock3, Combine, Database, Filter, GitBranch,
  Globe2, ListEnd, ListPlus, MousePointerClick, Pause, Radio, Repeat2, Route, Sigma, Split, SquareCode, Text,
  Timer, Webhook, Workflow,
} from 'lucide-react'
import type { WorkflowNodeDescriptor } from '../contracts.ts'
import { controlNodeDescriptors } from '../control-node-catalog.ts'
import { valueNodeDescriptors } from '../value-node-catalog.ts'
import { withCoreNodeExecution } from '../core-node-execution.ts'

const triggerOutput = [{ id: 'output', label: 'flow', type: 'flow' as const }]

const fallbackCatalog: WorkflowNodeDescriptor[] = [
  ...controlNodeDescriptors(),
  ...valueNodeDescriptors(),
  { type: 'trigger.agent', title: 'Agent input', description: '接收 AI Agent 工具提供的输入', category: 'trigger', color: '#22c55e', icon: 'bot', inputs: [], outputs: triggerOutput },
  { type: 'trigger.manual', title: 'Manual Trigger', description: '手动启动工作流', category: 'trigger', color: '#22c55e', icon: 'mouse-pointer-click', inputs: [], outputs: triggerOutput },
  { type: 'trigger.webhook', title: 'Webhook', description: '接收带专用令牌的 HTTP 输入；需 Host Web 服务', category: 'trigger', color: '#22c55e', icon: 'webhook', inputs: [], outputs: triggerOutput },
  { type: 'trigger.schedule', title: 'Schedule', description: 'Host Cron 监听器尚未安装', category: 'trigger', color: '#22c55e', icon: 'clock-3', available: false, inputs: [], outputs: triggerOutput },
  { type: 'trigger.dsh-event', title: 'DSH Event', description: 'Host 事件订阅器尚未安装', category: 'trigger', color: '#22c55e', icon: 'radio', available: false, inputs: [], outputs: triggerOutput },
  {
    type: 'http.request',
    title: 'HTTP Request',
    description: '调用远程 HTTP API',
    category: 'action',
    color: '#fb923c',
    icon: 'globe-2',
    inputs: [{ id: 'input', label: 'flow', type: 'flow' }, { id: 'body', type: 'json' }],
    outputs: [
      { id: 'body', label: 'json', type: 'json' },
      { id: 'text', label: 'text', type: 'text' },
      { id: 'status', label: 'status', type: 'number' },
      { id: 'headers', label: 'headers', type: 'json' },
    ],
  },
  { type: 'script.javascript', title: 'JavaScript', description: '通过 DSH run_code 执行脚本', category: 'action', color: '#facc15', icon: 'square-code', available: true, inputs: [{ id: 'input', label: 'flow', type: 'flow' }, { id: 'json', type: 'json' }, { id: 'text', type: 'text' }], outputs: [{ id: 'output', label: 'json', type: 'json' }, { id: 'text', type: 'text' }, { id: 'flow', type: 'flow' }] },
  {
    type: 'builtin.condition',
    title: 'Condition',
    description: '按条件分支数据',
    category: 'logic',
    color: '#a78bfa',
    icon: 'git-branch',
    inputs: [{ id: 'input', label: 'json', type: 'json' }],
    outputs: [
      { id: 'value', label: 'value', type: 'json' },
      { id: 'matched', label: 'matched', type: 'boolean' },
    ],
  },
  { type: 'builtin.set', title: 'Set Fields', description: '设置或转换字段', category: 'logic', color: '#38bdf8', icon: 'list-plus', inputs: [{ id: 'input', label: 'flow', type: 'flow' }, { id: 'json', type: 'json' }], outputs: [{ id: 'output', type: 'json' }] },
  { type: 'builtin.filter', title: 'Filter', description: '按条件保留 JSON 项目', category: 'logic', group: 'Core/Flow', color: '#a78bfa', icon: 'filter', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'json', type: 'json' }] },
  { type: 'builtin.merge', title: 'Merge', description: '合并两个 JSON 输入', category: 'logic', group: 'Core/Flow', color: '#a78bfa', icon: 'combine', inputs: [{ id: 'left', type: 'json' }, { id: 'right', type: 'json' }], outputs: [{ id: 'json', type: 'json' }] },
  { type: 'builtin.limit', title: 'Limit', description: '限制 JSON 数组的项目数量', category: 'logic', group: 'Core/Flow', color: '#a78bfa', icon: 'list-end', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'json', type: 'json' }] },
  { type: 'builtin.date-time', title: 'Date & Time', description: '解析并标准化日期时间', category: 'data', group: 'Core/Data', color: '#38bdf8', icon: 'calendar-clock', inputs: [{ id: 'date', type: 'text' }, { id: 'timestamp', type: 'number' }], outputs: [{ id: 'iso', type: 'text' }, { id: 'timestamp', type: 'number' }, { id: 'parts', type: 'json' }] },
  { type: 'builtin.switch', title: 'Switch', description: '按第一条匹配规则或 fallback 路由 JSON', category: 'logic', group: 'Core/Flow', color: '#a78bfa', icon: 'split', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'match', type: 'json' }, { id: 'fallback', type: 'json' }, { id: 'index', type: 'number' }] },
  { type: 'builtin.sort', title: 'Sort', description: '按嵌套字段排序 JSON 数组', category: 'data', group: 'Core/Data', color: '#38bdf8', icon: 'arrow-down-up', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'json', type: 'json' }] },
  { type: 'builtin.aggregate', title: 'Aggregate', description: '统计或聚合 JSON 数组数值', category: 'data', group: 'Core/Data', color: '#38bdf8', icon: 'sigma', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'result', type: 'number' }, { id: 'items', type: 'json' }] },
  { type: 'builtin.json-parse', title: 'Parse JSON', description: '把文本解析成 JSON', category: 'data', group: 'Core/Data', color: '#38bdf8', icon: 'braces', inputs: [{ id: 'text', type: 'text' }], outputs: [{ id: 'json', type: 'json' }] },
  { type: 'builtin.json-stringify', title: 'Stringify JSON', description: '把 JSON 序列化为文本', category: 'data', group: 'Core/Data', color: '#38bdf8', icon: 'text', inputs: [{ id: 'json', type: 'json' }], outputs: [{ id: 'text', type: 'text' }] },
  { type: 'builtin.wait', title: 'Wait', description: '暂停当前执行分支', category: 'logic', group: 'Core/Flow', color: '#a78bfa', icon: 'timer', inputs: [{ id: 'flow', type: 'flow' }], outputs: [{ id: 'output', label: 'flow', type: 'flow' }] },
  { type: 'builtin.stop-error', title: 'Stop & Error', description: '用明确错误终止执行', category: 'logic', group: 'Core/Flow', color: '#ef4444', icon: 'circle-stop', inputs: [{ id: 'flow', type: 'flow' }], outputs: [] },
  { type: 'builtin.noop', title: 'No Operation', description: '保留控制流，不修改信号', category: 'logic', group: 'Core/Flow', color: '#94a3b8', icon: 'route', inputs: [{ id: 'flow', type: 'flow' }], outputs: [{ id: 'output', label: 'flow', type: 'flow' }] },
  { type: 'dsh.agent', title: 'DSH Agent', description: '原生 Subagent · AgentOptions / Structured Output / Tool Filter', category: 'ai', color: '#60a5fa', icon: 'bot', available: true, inputs: [{ id: 'input', label: 'json', type: 'json' }, { id: 'flow', type: 'flow' }, { id: 'text', type: 'text' }], outputs: [{ id: 'result', label: 'result', type: 'json' }] },
  { type: 'dsh.llm', title: 'LLM', description: '调用宿主大模型能力', category: 'ai', color: '#818cf8', icon: 'braces', available: false, inputs: [{ id: 'text', type: 'text' }, { id: 'json', type: 'json' }], outputs: [{ id: 'text', type: 'text' }, { id: 'usage', type: 'json' }] },
  { type: 'storage.write', title: 'Storage', description: '写入本次 Host 执行产物', category: 'data', color: '#2dd4bf', icon: 'database', inputs: [{ id: 'input', label: 'json', type: 'json' }], outputs: [{ id: 'output', label: 'receipt', type: 'json' }] },
]
export const NODE_CATALOG: WorkflowNodeDescriptor[] = fallbackCatalog.map(withCoreNodeExecution)

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
  filter: Filter,
  combine: Combine,
  'list-end': ListEnd,
  'calendar-clock': CalendarClock,
  route: Route,
  split: Split,
  'arrow-down-up': ArrowDownUp,
  sigma: Sigma,
  text: Text,
  timer: Timer,
  'circle-stop': CircleStop,
  workflow: Workflow,
  'repeat-2': Repeat2,
  pause: Pause,
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
    inputs: [{ id: 'json', type: 'json' }],
    outputs: [{ id: 'json', type: 'json' }],
  }
}

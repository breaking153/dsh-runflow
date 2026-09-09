import { useSyncExternalStore } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'

export type RunFlowLanguage = 'zh' | 'en'

const en = {
  workflowTemplates: 'Workflow templates', templateIntro: 'Reusable RunFlow graph fragments',
  templateName: 'Template name', saveSelection: 'Save selection', selectTemplateNodes: 'Select one or more nodes first.',
  templateContents: '{nodes} nodes · {edges} internal links', searchTemplates: 'Search templates', insertTemplate: 'Insert',
  noTemplates: 'No templates yet', noTemplatesHint: 'Select nodes and save your first reusable fragment.',
  noMatchingTemplates: 'No matching templates', noMatchingTemplatesHint: 'Try a different name or clear the search.',
  templateSaveError: 'Templates could not be saved. Free browser storage or allow site data, then try again.',
  keyboardShortcuts: 'Keyboard shortcuts', keyboardShortcutsHint: 'Click a shortcut, then press a new combination',
  searchShortcuts: 'Search keyboard shortcuts', resetShortcuts: 'Reset all', recordShortcut: 'Press keys…',
  workflows: 'Workflows', overview: 'Overview', workflowIntro: 'Build and manage automations running inside DeepSeek Harness.',
  createWorkflow: 'Create workflow', searchWorkflows: 'Search workflows', allWorkflows: 'All workflows',
  name: 'Name', lastExecution: 'Last execution', updated: 'Updated', actions: 'Actions', noRuns: 'No runs',
  noWorkflows: 'No workflows found', noWorkflowsHint: 'Create a workflow or change the search.',
  duplicate: 'Duplicate', delete: 'Delete', editor: 'Editor', executions: 'Executions', activity: 'Activity',
  executionIntro: 'Inspect Host runs, results, artifacts and failures.', allStatuses: 'All statuses', started: 'Started',
  duration: 'Duration', trigger: 'Trigger', noExecutions: 'No executions yet', noExecutionsHint: 'Run a workflow to see its history here.',
  workflowName: 'Workflow name', backToWorkflows: 'Back to workflows', export: 'Export', templates: 'Templates', keys: 'Keys',
  saving: 'Saving…', saved: 'Saved', localFile: 'Local file', localDraft: 'Local draft', saveFailed: 'Save failed', stop: 'Stop', executeWorkflow: 'Execute workflow',
  addNode: 'Add node', selectHint: 'Drag to select · Right-drag to pan · Right-click to add', undo: 'Undo', redo: 'Redo',
  hideLinks: 'Hide links', showLinks: 'Show links', toggleMinimap: 'Toggle minimap', zoomOut: 'Zoom out', zoomIn: 'Zoom in', fitView: 'Fit view',
  copy: 'Copy', cut: 'Cut', paste: 'Paste', group: 'Group', subflow: 'Subflow', selectAll: 'Select all',
  selectedItems: '{count} selected', clearSelection: 'Clear selection', addReroute: 'Add reroute', saveNow: 'Save now',
  commandPalette: 'Command palette', searchCommands: 'Search commands…', noMatchingCommands: 'No matching commands',
  navigate: 'Navigate', runCommand: 'Run', openCommandPalette: 'Open command palette',
  root: 'Root', hostConnected: 'DSH Host connected', hostDisconnected: 'Host disconnected',
  inspector: 'Node', inspectorHint: 'Configure the selected node', parameters: 'Parameters', settings: 'Settings', output: 'Output',
  chooseNode: 'Select a node to edit its parameters', displayName: 'Display name', retry: 'Retry', timeout: 'Timeout (ms)',
  runNode: 'Run node', runningHost: 'Running in Host…', deleteNode: 'Delete node', duplicateNode: 'Duplicate node',
  noOutput: 'No execution output yet.', outputAvailable: 'Inspect the latest node result, logs, and artifacts.',
  closeInspector: 'Close inspector', resizeInspector: 'Resize inspector', nodeLibrary: 'Node Library',
  previewTitle: 'RunFlow overview', workflowCount: '{count} workflows', runningCount: '{count} running', openManager: 'Open workflow manager',
  emptyHost: 'No workflows in the current Host', recentRecords: '{count} recent executions', returnSession: 'Return to chat',
  focusMode: 'Focus workspace', floatingHint: 'Drag the title bar to move · drag edges to resize', maximize: 'Maximize', restore: 'Restore window', close: 'Close RunFlow',
  ready: 'Ready', running: 'Running', success: 'Success', failed: 'Failed', skipped: 'Skipped', cancelled: 'Cancelled',
  input: 'Input', outputs: 'Outputs', none: 'None', compatibleNode: 'Connect a compatible node', whatNext: 'What happens next?',
  searchNodes: 'Search nodes, capabilities or types…', allNodes: 'All nodes', recent: 'Recent', favorites: 'Favorites',
  general: 'General', configuration: 'Configuration', runSettings: 'Run settings', workflowOutputDir: 'Workflow output directory (optional)', runInput: 'Run input · JSON',
  nodes: 'Nodes', syncing: 'Syncing…', searchNodesShort: 'Search nodes or groups', unavailable: 'Unavailable',
  collapseSidebar: 'Collapse sidebar', expandSidebar: 'Expand sidebar', noMatchingNodes: 'No matching nodes', openWorkflowHint: 'Open a workflow to insert nodes',
  nodeLabDescription: 'Edit Node / Script source and hot reload', hostOnline: 'Host connected',
  review: 'Review', execution: 'Execution', inspectorContextHint: 'Review, configure, then inspect evidence',
  reviewDraftTitle: 'AI draft review', reviewDraftHint: 'Inspect the Agent proposal before running it.', reviewSummary: 'Review summary',
  additions: 'Added', removals: 'Removed', changes: 'Changed', errors: 'Errors', diagnostics: 'Diagnostics', reviewChanges: 'Proposed changes',
  noReview: 'No draft waiting for review', noReviewHint: 'Agent-generated workflow changes will appear here.', noReviewChanges: 'The candidate matches the current workflow.',
  awaitingReview: 'Awaiting review', reviewEdited: 'Edited by user', reviewAccepted: 'Accepted', reviewDismissed: 'Dismissed',
  acceptDraft: 'Accept draft', dismissReview: 'Dismiss', clearReview: 'Clear review',
  executionOutput: 'Execution output', noExecutionEvidence: 'No execution evidence', noExecutionEvidenceHint: 'Run the selected node or workflow to inspect its result.', openExecutionDetails: 'Open full details',
} as const

const zh: Record<keyof typeof en, string> = {
  workflowTemplates: '工作流模板', templateIntro: '可复用的 RunFlow 图形片段',
  templateName: '模板名称', saveSelection: '保存选区', selectTemplateNodes: '请先选择一个或多个节点。',
  templateContents: '{nodes} 个节点 · {edges} 条内部连线', searchTemplates: '搜索模板', insertTemplate: '插入',
  noTemplates: '暂无模板', noTemplatesHint: '选择节点，保存第一个可复用片段。',
  noMatchingTemplates: '没有匹配的模板', noMatchingTemplatesHint: '尝试其他名称，或清空搜索。',
  templateSaveError: '模板保存失败。请释放浏览器存储空间或允许站点保存数据，然后重试。',
  keyboardShortcuts: '键盘快捷键', keyboardShortcutsHint: '点击快捷键后按下新的组合键',
  searchShortcuts: '搜索快捷键', resetShortcuts: '全部重置', recordShortcut: '请按键…',
  workflows: '工作流', overview: '概览', workflowIntro: '创建并管理运行于 DeepSeek Harness 内的自动化流程。',
  createWorkflow: '创建工作流', searchWorkflows: '搜索工作流', allWorkflows: '全部工作流',
  name: '名称', lastExecution: '最近执行', updated: '更新时间', actions: '操作', noRuns: '暂无执行',
  noWorkflows: '没有找到工作流', noWorkflowsHint: '创建工作流或调整搜索条件。',
  duplicate: '创建副本', delete: '删除', editor: '编辑器', executions: '执行记录', activity: '运行记录',
  executionIntro: '查看 Host 执行、结果、产物和错误。', allStatuses: '全部状态', started: '开始时间',
  duration: '耗时', trigger: '触发方式', noExecutions: '暂无执行记录', noExecutionsHint: '运行一次工作流后会在这里显示历史。',
  workflowName: '工作流名称', backToWorkflows: '返回工作流', export: '导出', templates: '模板', keys: '快捷键',
  saving: '正在保存…', saved: '已保存', localFile: '本地文件', localDraft: '本地草稿', saveFailed: '保存失败', stop: '停止', executeWorkflow: '执行工作流',
  addNode: '添加节点', selectHint: '左键框选 · 按住右键平移 · 右键点击添加', undo: '撤销', redo: '重做',
  hideLinks: '隐藏连线', showLinks: '显示连线', toggleMinimap: '切换小地图', zoomOut: '缩小', zoomIn: '放大', fitView: '适应画布',
  copy: '复制', cut: '剪切', paste: '粘贴', group: '分组', subflow: '子流程', selectAll: '全选',
  selectedItems: '已选择 {count} 项', clearSelection: '清除选择', addReroute: '添加转接点', saveNow: '立即保存',
  commandPalette: '命令面板', searchCommands: '搜索命令…', noMatchingCommands: '没有匹配的命令',
  navigate: '导航', runCommand: '执行', openCommandPalette: '打开命令面板',
  root: '根流程', hostConnected: 'DSH Host 已连接', hostDisconnected: 'Host 未连接',
  inspector: '节点', inspectorHint: '配置当前选中的节点', parameters: '参数', settings: '设置', output: '输出',
  chooseNode: '选择一个节点以编辑参数', displayName: '显示名称', retry: '重试次数', timeout: '超时（毫秒）',
  runNode: '运行此节点', runningHost: 'Host 执行中…', deleteNode: '删除节点', duplicateNode: '复制节点',
  noOutput: '该节点还没有执行输出。', outputAvailable: '查看最近一次节点结果、日志和产物。',
  closeInspector: '关闭属性栏', resizeInspector: '调整属性栏宽度', nodeLibrary: '节点库',
  previewTitle: 'RunFlow 概览', workflowCount: '{count} 个工作流', runningCount: '{count} 个运行中', openManager: '打开工作流管理',
  emptyHost: '当前 Host 中还没有工作流', recentRecords: '最近 {count} 条执行记录', returnSession: '返回会话',
  focusMode: '专注工作区', floatingHint: '拖拽标题栏移动 · 拖拽边缘缩放', maximize: '最大化', restore: '还原窗口', close: '关闭 RunFlow',
  ready: '就绪', running: '运行中', success: '成功', failed: '失败', skipped: '已跳过', cancelled: '已取消',
  input: '输入', outputs: '输出', none: '无', compatibleNode: '连接兼容节点', whatNext: '接下来做什么？',
  searchNodes: '搜索节点、能力或类型…', allNodes: '全部节点', recent: '最近使用', favorites: '收藏',
  general: '通用', configuration: '参数配置', runSettings: '运行设置', workflowOutputDir: '工作流输出目录（可选）', runInput: '运行输入 · JSON',
  nodes: '节点', syncing: '同步中…', searchNodesShort: '搜索节点或分组', unavailable: '不可用',
  collapseSidebar: '收起侧栏', expandSidebar: '展开侧栏', noMatchingNodes: '没有匹配的节点', openWorkflowHint: '打开工作流后即可插入节点',
  nodeLabDescription: '编辑 Node / Script 源码并热重载', hostOnline: 'Host 已连接',
  review: '审阅', execution: '执行结果', inspectorContextHint: '先审阅，再配置，最后查看执行证据',
  reviewDraftTitle: 'AI 草稿审阅', reviewDraftHint: '执行前检查 Agent 提议的工作流变更。', reviewSummary: '审阅摘要',
  additions: '新增', removals: '移除', changes: '修改', errors: '错误', diagnostics: '诊断', reviewChanges: '变更内容',
  noReview: '没有待审阅草稿', noReviewHint: 'AI Agent 生成的工作流变更会显示在这里。', noReviewChanges: '候选内容与当前工作流一致。',
  awaitingReview: '等待审阅', reviewEdited: '用户已微调', reviewAccepted: '已接受', reviewDismissed: '已忽略',
  acceptDraft: '接受草稿', dismissReview: '忽略', clearReview: '清除审阅',
  executionOutput: '执行输出', noExecutionEvidence: '暂无执行证据', noExecutionEvidenceHint: '运行当前节点或工作流后查看结果。', openExecutionDetails: '打开完整详情',
}

export type RunFlowLocaleKey = keyof typeof en

export function relativeTime(value: string | undefined, language: RunFlowLanguage): string {
  if (value === undefined) return language === 'zh' ? '未保存' : 'Not saved'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return language === 'zh' ? '刚刚' : 'just now'
  if (seconds < 3600) return language === 'zh' ? `${Math.floor(seconds / 60)} 分钟前` : Math.floor(seconds / 60) + 'm ago'
  if (seconds < 86400) return language === 'zh' ? `${Math.floor(seconds / 3600)} 小时前` : Math.floor(seconds / 3600) + 'h ago'
  return language === 'zh' ? `${Math.floor(seconds / 86400)} 天前` : Math.floor(seconds / 86400) + 'd ago'
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    runflow: RunFlowLocaleKey
  }
}

let active: RunFlowLanguage = typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
let revision = 0
const listeners = new Set<() => void>()

function publish(language: string): void {
  const next: RunFlowLanguage = language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  if (next === active) return
  active = next
  revision += 1
  for (const listener of [...listeners]) listener()
}

export function connectFlowLocale(ctx: ClientContext): () => void {
  const unregister = ctx.locale.register('runflow', { zh, en })
  publish(ctx.locale.getSnapshot().active)
  const unsubscribe = ctx.locale.subscribe(() => publish(ctx.locale.getSnapshot().active))
  return () => { unsubscribe(); unregister() }
}

export function translateRunFlow(key: RunFlowLocaleKey, values: Record<string, string | number> = {}): string {
  return (active === 'zh' ? zh[key] : en[key]).replace(/\{([^}]+)\}/g, (_match, name: string) => String(values[name] ?? ''))
}

export function useRunFlowLocale() {
  useSyncExternalStore(
    listener => { listeners.add(listener); return () => listeners.delete(listener) },
    () => revision,
    () => revision,
  )
  return { language: active, t: translateRunFlow }
}

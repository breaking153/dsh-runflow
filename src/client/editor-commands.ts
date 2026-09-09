import { readBrowserStorage, removeBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'

export type EditorCommandId =
  | 'workflow.save'
  | 'workflow.run'
  | 'graph.undo'
  | 'graph.redo'
  | 'graph.copy'
  | 'graph.cut'
  | 'graph.paste'
  | 'graph.duplicate'
  | 'graph.delete'
  | 'graph.selectAll'
  | 'graph.group'
  | 'graph.subflow'
  | 'graph.addNode'
  | 'ui.commandPalette'

export interface EditorCommandDefinition {
  id: EditorCommandId
  label: string
  shortcut: string
  keywords: string[]
}

export const EDITOR_COMMANDS: EditorCommandDefinition[] = [
  { id: 'workflow.save', label: 'Save workflow', shortcut: 'Ctrl S', keywords: ['persist', '保存'] },
  { id: 'workflow.run', label: 'Execute workflow', shortcut: 'Ctrl Enter', keywords: ['run', '执行'] },
  { id: 'graph.undo', label: 'Undo', shortcut: 'Ctrl Z', keywords: ['history', '撤销'] },
  { id: 'graph.redo', label: 'Redo', shortcut: 'Ctrl Shift Z', keywords: ['history', '重做'] },
  { id: 'graph.copy', label: 'Copy selection', shortcut: 'Ctrl C', keywords: ['clipboard', '复制'] },
  { id: 'graph.cut', label: 'Cut selection', shortcut: 'Ctrl X', keywords: ['clipboard', '剪切'] },
  { id: 'graph.paste', label: 'Paste', shortcut: 'Ctrl V', keywords: ['clipboard', '粘贴'] },
  { id: 'graph.duplicate', label: 'Duplicate selection', shortcut: 'Ctrl D', keywords: ['copy', '重复'] },
  { id: 'graph.delete', label: 'Delete selection', shortcut: 'Backspace', keywords: ['remove', '删除'] },
  { id: 'graph.selectAll', label: 'Select all nodes', shortcut: 'Ctrl A', keywords: ['selection', '全选'] },
  { id: 'graph.group', label: 'Group selection', shortcut: 'Ctrl G', keywords: ['organize', '分组'] },
  { id: 'graph.subflow', label: 'Convert selection to subflow', shortcut: 'Ctrl Shift G', keywords: ['nested', 'pack', '子图'] },
  { id: 'graph.addNode', label: 'Add node', shortcut: 'Shift A', keywords: ['search', '节点'] },
  { id: 'ui.commandPalette', label: 'Open command palette', shortcut: 'Ctrl K', keywords: ['commands', '命令'] },
]

const KEYBINDING_STORAGE_KEY = 'dsh-runflow:keybindings'
let keybindingOverrides: Partial<Record<EditorCommandId, string>> = {}

function loadOverrides(): void {
  try {
    const value = JSON.parse(readBrowserStorage(KEYBINDING_STORAGE_KEY) ?? '{}') as unknown
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) keybindingOverrides = value as Partial<Record<EditorCommandId, string>>
  } catch { keybindingOverrides = {} }
}
loadOverrides()

export function editorCommandDefinitions(): EditorCommandDefinition[] {
  return EDITOR_COMMANDS.map(command => ({ ...command, shortcut: keybindingOverrides[command.id] ?? command.shortcut }))
}

export function setEditorKeybinding(id: EditorCommandId, shortcut: string): void {
  const normalized = shortcut.trim().replace(/\s+/g, ' ')
  const original = EDITOR_COMMANDS.find(command => command.id === id)?.shortcut
  if (normalized === '' || normalized === original) delete keybindingOverrides[id]
  else keybindingOverrides[id] = normalized
  writeBrowserStorage(KEYBINDING_STORAGE_KEY, JSON.stringify(keybindingOverrides))
}

export function resetEditorKeybindings(): void {
  keybindingOverrides = {}
  removeBrowserStorage(KEYBINDING_STORAGE_KEY)
}

const NATIVE_EDIT_COMMANDS = new Set<EditorCommandId>([
  'graph.undo', 'graph.redo', 'graph.copy', 'graph.cut', 'graph.paste', 'graph.delete', 'graph.selectAll',
])

export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]') !== null
}

export function shortcutForKeyboardEvent(event: KeyboardEvent): string | undefined {
  const ignored = new Set(['Control', 'Meta', 'Shift', 'Alt'])
  if (ignored.has(event.key)) return undefined
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key === ' ' ? 'Space' : event.key
  parts.push(key)
  return parts.join(' ')
}

function mappedCommand(event: KeyboardEvent): EditorCommandId | undefined {
  const shortcut = shortcutForKeyboardEvent(event)
  if (shortcut === undefined) return undefined
  const matched = editorCommandDefinitions().find(command => command.shortcut.toLowerCase() === shortcut.toLowerCase())?.id
  if (matched !== undefined) return matched
  if (shortcut.toLowerCase() === 'delete' && keybindingOverrides['graph.delete'] === undefined) return 'graph.delete'
  if (shortcut.toLowerCase() === 'ctrl y' && keybindingOverrides['graph.redo'] === undefined) return 'graph.redo'
  return undefined
}

export function commandForKeyboardEvent(event: KeyboardEvent, target: EventTarget | null = event.target): EditorCommandId | undefined {
  const command = mappedCommand(event)
  if (command === undefined) return undefined
  if (isEditableEventTarget(target) && NATIVE_EDIT_COMMANDS.has(command)) return undefined
  return command
}

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Clipboard, ClipboardPaste, Copy, CornerDownRight, Group, MousePointer2, Redo2,
  Route, Save, Search, Trash2, Undo2, X, Zap,
} from 'lucide-react'
import { editorCommandDefinitions, type EditorCommandId } from './editor-commands.ts'
import { useRunFlowLocale, type RunFlowLocaleKey } from './locale.ts'
import { useDialogFocus } from './use-dialog-focus.ts'

export type ContextMenuKind = 'pane' | 'node' | 'selection' | 'edge'

export interface CanvasMenuState {
  x: number
  y: number
  flowX: number
  flowY: number
  kind: ContextMenuKind
  edgeId?: string
}

interface CommandPaletteProps {
  open: boolean
  onClose(): void
  onCommand(command: EditorCommandId): void
}

const iconByCommand: Partial<Record<EditorCommandId, ReactNode>> = {
  'workflow.save': <Save size={15} />,
  'workflow.run': <Zap size={15} />,
  'graph.undo': <Undo2 size={15} />,
  'graph.redo': <Redo2 size={15} />,
  'graph.copy': <Copy size={15} />,
  'graph.cut': <Clipboard size={15} />,
  'graph.paste': <ClipboardPaste size={15} />,
  'graph.delete': <Trash2 size={15} />,
  'graph.selectAll': <MousePointer2 size={15} />,
  'graph.group': <Group size={15} />,
  'graph.subflow': <CornerDownRight size={15} />,
  'graph.addNode': <CornerDownRight size={15} />,
}

const commandLocaleKey: Record<EditorCommandId, RunFlowLocaleKey> = {
  'workflow.save': 'saveNow',
  'workflow.run': 'executeWorkflow',
  'graph.undo': 'undo',
  'graph.redo': 'redo',
  'graph.copy': 'copy',
  'graph.cut': 'cut',
  'graph.paste': 'paste',
  'graph.duplicate': 'duplicate',
  'graph.delete': 'delete',
  'graph.selectAll': 'selectAll',
  'graph.group': 'group',
  'graph.subflow': 'subflow',
  'graph.addNode': 'addNode',
  'ui.commandPalette': 'openCommandPalette',
}

export function CommandPalette({ open, onClose, onCommand }: CommandPaletteProps) {
  const { t } = useRunFlowLocale()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogFocus(open, onClose)
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return editorCommandDefinitions().filter(command => command.id !== 'ui.commandPalette')
      .filter(command => needle === '' || `${command.label} ${command.keywords.join(' ')}`.toLowerCase().includes(needle))
  }, [open, query])
  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
  }, [open])
  if (!open) return null
  const choose = (command: EditorCommandId): void => { onCommand(command); onClose() }
  return <div className="command-palette-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} className="command-palette" role="dialog" aria-modal="true" aria-label={t('commandPalette')}>
      <label><Search size={17} /><input ref={inputRef} data-dialog-autofocus value={query} onChange={event => { setQuery(event.target.value); setActive(0) }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(value => Math.min(items.length - 1, value + 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(value => Math.max(0, value - 1)) }
        if (event.key === 'Enter' && items[active] !== undefined) { event.preventDefault(); choose(items[active]!.id) }
      }} placeholder={t('searchCommands')} aria-label={t('searchCommands')} role="combobox" aria-expanded="true" aria-autocomplete="list" aria-activedescendant={items[active] === undefined ? undefined : `runflow-command-${items[active]!.id}`} aria-controls="runflow-command-list" /></label>
      <div id="runflow-command-list" className="command-list" role="listbox" aria-label={t('commandPalette')}>
        {items.map((command, index) => <button id={`runflow-command-${command.id}`} key={command.id} role="option" aria-selected={index === active} className={index === active ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => choose(command.id)}>
          <span>{iconByCommand[command.id] ?? <CornerDownRight size={15} />}</span><strong>{t(commandLocaleKey[command.id])}</strong><kbd>{command.shortcut.replaceAll('Ctrl', navigator.platform.includes('Mac') ? '⌘' : 'Ctrl')}</kbd>
        </button>)}
        {items.length === 0 && <p>{t('noMatchingCommands')}</p>}
      </div>
      <footer><span><kbd>↑↓</kbd> {t('navigate')}</span><span><kbd>Enter</kbd> {t('runCommand')}</span><span><kbd>Esc</kbd> {t('close')}</span></footer>
    </section>
  </div>
}

export function CanvasContextMenu({ menu, canPaste, canUndo, canRedo, onClose, onCommand, onAddNode, onReroute }: {
  menu: CanvasMenuState
  canPaste: boolean
  canUndo: boolean
  canRedo: boolean
  onClose(): void
  onCommand(command: EditorCommandId): void
  onAddNode(): void
  onReroute?(): void
}) {
  const { t } = useRunFlowLocale()
  const run = (command: EditorCommandId): void => { onCommand(command); onClose() }
  const selection = menu.kind !== 'pane'
  return <>
    <button className="canvas-menu-scrim" onClick={onClose} aria-label={t('close')} />
    <div className="canvas-context-menu" role="menu" aria-label={t('configuration')} style={{ left: menu.x, top: menu.y }}>
      <button role="menuitem" onClick={() => { onAddNode(); onClose() }}><CornerDownRight size={15} /><span>{t('addNode')}</span><kbd>Shift A</kbd></button>
      {menu.kind === 'edge' && <button role="menuitem" onClick={() => { onReroute?.(); onClose() }}><Route size={15} /><span>{t('addReroute')}</span><kbd>Alt click</kbd></button>}
      <div role="separator" />
      {selection && <button role="menuitem" onClick={() => run('graph.copy')}><Copy size={15} /><span>{t('copy')}</span><kbd>Ctrl C</kbd></button>}
      {selection && <button role="menuitem" onClick={() => run('graph.duplicate')}><Clipboard size={15} /><span>{t('duplicate')}</span><kbd>Ctrl D</kbd></button>}
      <button role="menuitem" disabled={!canPaste} onClick={() => run('graph.paste')}><ClipboardPaste size={15} /><span>{t('paste')}</span><kbd>Ctrl V</kbd></button>
      {selection && <button className="danger" role="menuitem" onClick={() => run('graph.delete')}><Trash2 size={15} /><span>{t('delete')}</span><kbd>Del</kbd></button>}
      <div role="separator" />
      <button role="menuitem" disabled={!canUndo} onClick={() => run('graph.undo')}><Undo2 size={15} /><span>{t('undo')}</span><kbd>Ctrl Z</kbd></button>
      <button role="menuitem" disabled={!canRedo} onClick={() => run('graph.redo')}><Redo2 size={15} /><span>{t('redo')}</span><kbd>Ctrl ⇧ Z</kbd></button>
      {menu.kind === 'pane' && <button role="menuitem" onClick={() => run('graph.selectAll')}><MousePointer2 size={15} /><span>{t('selectAll')}</span><kbd>Ctrl A</kbd></button>}
    </div>
  </>
}

export function SelectionToolbar({ count, workflowNodeCount, onCommand, onClose }: { count: number; workflowNodeCount: number; onCommand(command: EditorCommandId): void; onClose(): void }) {
  const { t } = useRunFlowLocale()
  if (count === 0) return null
  return <div className="selection-toolbar" role="toolbar" aria-label={t('selectedItems', { count })}>
    <strong>{t('selectedItems', { count })}</strong>
    {workflowNodeCount > 0 && <button onClick={() => onCommand('graph.copy')} title={t('copy')}><Copy size={15} /><span>{t('copy')}</span></button>}
    {workflowNodeCount > 0 && <button onClick={() => onCommand('graph.duplicate')} title={t('duplicate')}><Clipboard size={15} /><span>{t('duplicate')}</span></button>}
    {workflowNodeCount > 1 && <button onClick={() => onCommand('graph.group')} title={t('group')}><Group size={15} /><span>{t('group')}</span></button>}
    {workflowNodeCount > 1 && <button onClick={() => onCommand('graph.subflow')} title={t('subflow')}><CornerDownRight size={15} /><span>{t('subflow')}</span></button>}
    <button className="danger" onClick={() => onCommand('graph.delete')} title={t('delete')}><Trash2 size={15} /><span>{t('delete')}</span></button>
    <button onClick={onClose} aria-label={t('clearSelection')}><X size={14} /></button>
  </div>
}

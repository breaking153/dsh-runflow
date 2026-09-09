import { useState } from 'react'
import { Keyboard, RotateCcw, Search, X } from 'lucide-react'
import {
  editorCommandDefinitions, resetEditorKeybindings, setEditorKeybinding,
  shortcutForKeyboardEvent, type EditorCommandId,
} from './editor-commands.ts'
import { useDialogFocus } from './use-dialog-focus.ts'
import { useRunFlowLocale } from './locale.ts'

export function KeybindingSettings({ open, onClose }: { open: boolean; onClose(): void }) {
  return open ? <KeybindingSettingsContent onClose={onClose} /> : null
}

function KeybindingSettingsContent({ onClose }: { onClose(): void }) {
  const { t } = useRunFlowLocale()
  const dialogRef = useDialogFocus(true, onClose)
  const [query, setQuery] = useState('')
  const [, render] = useState(0)
  const [recording, setRecording] = useState<EditorCommandId>()
  const commands = editorCommandDefinitions().filter(command => `${command.label} ${command.keywords.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="keybindings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={dialogRef} tabIndex={-1} className="keybindings-dialog" role="dialog" aria-modal="true" aria-label={t('keyboardShortcuts')}>
      <header><span><Keyboard size={18} /><span><strong>{t('keyboardShortcuts')}</strong><small>{t('keyboardShortcutsHint')}</small></span></span><button onClick={onClose} aria-label={t('close')}><X size={16} /></button></header>
      <div className="keybindings-tools"><label><Search size={14} /><input data-dialog-autofocus value={query} onChange={event => setQuery(event.target.value)} placeholder={t('searchShortcuts')} aria-label={t('searchShortcuts')} /></label><button onClick={() => { resetEditorKeybindings(); render(value => value + 1); setRecording(undefined) }}><RotateCcw size={13} />{t('resetShortcuts')}</button></div>
      <div className="keybindings-list">
        {commands.map(command => <div key={command.id}><span><strong>{command.label}</strong><small>{command.id}</small></span><button className={recording === command.id ? 'recording' : ''} onClick={() => setRecording(command.id)} onKeyDown={event => {
          if (recording !== command.id) return
          if (event.key === 'Escape') { event.preventDefault(); setRecording(undefined); return }
          const shortcut = shortcutForKeyboardEvent(event.nativeEvent)
          if (shortcut === undefined) return
          event.preventDefault(); event.stopPropagation()
          setEditorKeybinding(command.id, shortcut); setRecording(undefined); render(value => value + 1)
        }}>{recording === command.id ? t('recordShortcut') : <kbd>{command.shortcut}</kbd>}</button></div>)}
      </div>
    </section>
  </div>
}

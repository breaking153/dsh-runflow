import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Braces, Command, CornerDownLeft } from 'lucide-react'

export type CodeCompletionProfile = 'run-code' | 'cordis-node' | 'cordis-script'

interface Completion {
  value: string
  detail: string
}

const RUN_CODE_COMPLETIONS: Completion[] = [
  { value: 'input', detail: '兼容输入值' },
  { value: 'inputs', detail: '按引脚命名的输入对象' },
  { value: 'config', detail: '当前节点配置' },
  { value: 'runflow.executionId', detail: '执行 ID' },
  { value: 'runflow.nodeId', detail: '节点 ID' },
  { value: 'runflow.outputDir', detail: '本次执行输出目录' },
  { value: 'runflow.intermediateDir', detail: '中间结果目录' },
  { value: 'return { $runflow: \'port-outputs\', outputs: {} }', detail: '多输出引脚结果' },
]

const CORDIS_COMPLETIONS: Completion[] = [
  { value: 'ctx.flow.registerNode', detail: '注册 RunFlow Node Provider' },
  { value: 'ctx.flow.listNodes', detail: '读取实时节点目录' },
  { value: 'ctx.flowScript.submit', detail: '提交 DSH run_code 请求' },
  { value: 'ctx.flowScript.wait', detail: '等待 channel 结果' },
  { value: 'ctx.flowScript.run', detail: '提交并等待 run_code' },
  { value: 'ctx.agents.list', detail: '读取实时 Agent' },
  { value: 'ctx.llm.listProviders', detail: '读取模型 Provider' },
  { value: 'ctx.llm.listModels', detail: '读取 Provider 模型' },
  { value: 'ctx.subagents.list', detail: '读取 Subagent Provider' },
  { value: 'ctx.tools.get', detail: '读取 DSH Tool' },
  { value: 'ctx.logger.info', detail: 'Host info 日志' },
  { value: 'ctx.logger.warn', detail: 'Host warning 日志' },
  { value: 'ctx.effect', detail: '绑定 Cordis 生命周期' },
  { value: 'execution.input', detail: 'Node 输入值' },
  { value: 'execution.inputs', detail: '命名输入引脚' },
  { value: 'execution.node.config', detail: 'Node 配置' },
  { value: 'execution.log', detail: '写入节点执行日志' },
  { value: 'execution.writeIntermediate', detail: '写入中间结果' },
  { value: 'execution.outputDir', detail: '本次执行输出目录' },
  { value: 'execution.intermediateDir', detail: '中间结果目录' },
]

function tokenAt(source: string, caret: number): { start: number; text: string } {
  const prefix = source.slice(0, caret)
  const match = prefix.match(/[A-Za-z_$][\w$]*(?:\.[\w$]*)*$/)
  return match === null ? { start: caret, text: '' } : { start: caret - match[0].length, text: match[0] }
}

export function completionsFor(profile: CodeCompletionProfile, query: string): Completion[] {
  const source = profile === 'run-code' ? RUN_CODE_COMPLETIONS : [...CORDIS_COMPLETIONS, ...RUN_CODE_COMPLETIONS]
  const needle = query.toLowerCase()
  if (needle === '') return source.slice(0, 9)
  return source.filter(item => item.value.toLowerCase().startsWith(needle)).slice(0, 9)
}

export function LightCodeEditor({ value, onChange, profile, label = 'Code', minRows = 12 }: {
  value: string
  onChange(value: string): void
  profile: CodeCompletionProfile
  label?: string
  minRows?: number
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(0)
  const [caret, setCaret] = useState(0)
  const token = tokenAt(value, caret)
  const completions = useMemo(() => completionsFor(profile, token.text), [profile, token.text])
  const lines = Math.max(minRows, value.split('\n').length)

  const show = (): void => { setSelected(0); setOpen(true) }
  const insert = (completion: Completion): void => {
    const current = textarea.current
    const next = value.slice(0, token.start) + completion.value + value.slice(caret)
    const nextCaret = token.start + completion.value.length
    onChange(next)
    setCaret(nextCaret)
    setOpen(false)
    requestAnimationFrame(() => {
      current?.focus()
      current?.setSelectionRange(nextCaret, nextCaret)
    })
  }
  const insertIndent = (): void => {
    const current = textarea.current
    if (current === null) return
    const start = current.selectionStart
    const end = current.selectionEnd
    const next = value.slice(0, start) + '  ' + value.slice(end)
    onChange(next)
    setCaret(start + 2)
    requestAnimationFrame(() => current.setSelectionRange(start + 2, start + 2))
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
      event.preventDefault(); show(); return
    }
    if (open && completions.length > 0) {
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => (index + 1) % completions.length); return }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => (index - 1 + completions.length) % completions.length); return }
      if (event.key === 'Enter') { event.preventDefault(); insert(completions[selected] ?? completions[0]!); return }
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return }
    }
    if (event.key === 'Tab') { event.preventDefault(); insertIndent() }
  }

  return <div className="light-code-editor">
    <div className="light-code-toolbar">
      <span><Braces size={14} />{label}</span>
      <span>{profile === 'run-code' ? 'DSH run_code body' : 'Trusted Cordis plugin'}</span>
      <button type="button" onClick={show} title="显示补全 (Ctrl+Space)"><Command size={13} />补全</button>
    </div>
    <div className="light-code-body">
      <div className="light-code-lines" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
      <textarea
        ref={textarea}
        aria-label={label}
        spellCheck={false}
        value={value}
        rows={lines}
        onChange={event => {
          const nextCaret = event.currentTarget.selectionStart
          onChange(event.target.value)
          setCaret(nextCaret)
          if (event.target.value[nextCaret - 1] === '.') show()
          else if (open) setSelected(0)
        }}
        onClick={event => setCaret(event.currentTarget.selectionStart)}
        onKeyUp={event => setCaret(event.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        aria-autocomplete="list"
        aria-controls="runflow-code-completions"
        aria-expanded={open && completions.length > 0}
      />
      {open && completions.length > 0 && <div id="runflow-code-completions" className="light-code-completions" role="listbox" aria-label="代码补全">
        {completions.map((completion, index) => <button
          type="button"
          role="option"
          aria-selected={index === selected}
          className={index === selected ? 'selected' : ''}
          key={completion.value}
          onMouseDown={event => event.preventDefault()}
          onClick={() => insert(completion)}
        ><code>{completion.value}</code><span>{completion.detail}</span>{index === selected && <CornerDownLeft size={12} />}</button>)}
      </div>}
    </div>
    <div className="light-code-status"><span>{value.length} chars · {value.split('\n').length} lines</span><span>Tab 缩进 · Ctrl+Space 补全</span></div>
  </div>
}

/** Browser half: a sidebar launcher opening the full-screen workflow editor. */

import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Workflow } from 'lucide-react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { FlowApp } from './App.tsx'
import { connectFlowModelCatalog } from './model-catalog.ts'
import { FLOW_STYLES } from './styles.ts'

type FlowLauncherProps = PropsRuntime<'sidebar.footer.action'>

function FlowLauncher({ wide }: FlowLauncherProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flow-launcher" style={{ '--flow-launch-align': wide ? 'flex-start' : 'center' } as CSSProperties}>
      <style>{FLOW_STYLES}</style>
      <button type="button" className="flow-launcher-button" onClick={() => setOpen(true)} aria-label="打开 DSH Flow" title="DSH Flow">
        <Workflow size={18} />{wide && <span>Workflows</span>}
      </button>
      {open && createPortal(<div className="flow-overlay"><FlowApp onClose={() => setOpen(false)} /></div>, document.body)}
    </div>
  )
}

export const name = 'dsh-flow-client'
export const inject = ['slots', 'sessions', 'modelDirectories']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => connectFlowModelCatalog(ctx), 'dsh-flow: model directory bridge')
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'dsh-flow',
    order: 8,
  }, FlowLauncher))
}

import { describe, expect, it } from 'vitest'
import { COMFY_INTERACTION_STYLES } from '../src/client/comfy-interactions-styles.ts'
import { RUNFLOW_RESPONSIVE_STYLES } from '../src/client/responsive-styles.ts'

describe('RunFlow container-responsive layout', () => {
  it('adapts to the RunFlow surface instead of only the browser viewport', () => {
    expect(RUNFLOW_RESPONSIVE_STYLES).toContain('container-name:runflow-shell')
    expect(RUNFLOW_RESPONSIVE_STYLES).toContain('@container runflow-shell (max-width:1080px)')
    expect(RUNFLOW_RESPONSIVE_STYLES).toContain('@container runflow-shell (max-width:720px)')
  })

  it('keeps narrow selection actions below the inspector drawer so its tabs remain usable', () => {
    expect(COMFY_INTERACTION_STYLES).toContain('.selection-toolbar{position:absolute;z-index:32')
    expect(RUNFLOW_RESPONSIVE_STYLES).toContain('.selection-toolbar{z-index:24;')
    expect(RUNFLOW_RESPONSIVE_STYLES).toContain('bottom:0;z-index:25;')
  })
})

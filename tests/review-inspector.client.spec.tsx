// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import { InspectorPanel } from '../src/client/InspectorPanel.tsx'
import { makeNode, useFlowStore } from '../src/client/store.ts'

let host: HTMLDivElement
let root: Root

const base: WorkflowDefinition = {
  id: 'review-inspector',
  name: 'Review inspector',
  version: 1,
  nodes: [{ id: 'manual', type: 'trigger.manual', name: 'Manual Trigger', config: {}, position: { x: 20, y: 20 } }],
  edges: [],
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  useFlowStore.setState({
    workflowId: base.id,
    workflowName: base.name,
    version: base.version,
    workflowOutputDir: '',
    workflows: [structuredClone(base)],
    nodes: [{ ...makeNode('manual', 'trigger.manual', { x: 20, y: 20 }), selected: true }],
    edges: [],
    subflows: [],
    selectedNodeId: 'manual',
    selectedExecutionId: undefined,
    detailsNodeId: undefined,
    review: undefined,
    inspectorTab: undefined,
    dirty: false,
  })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function button(label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
  if (match === undefined) throw new Error('button not found: ' + label)
  return match
}

describe('review-first contextual inspector', () => {
  it('prioritizes an Agent review and keeps unexecuted output contextual', async () => {
    useFlowStore.getState().stageWorkflowReview({
      ...structuredClone(base),
      version: 2,
      nodes: [...base.nodes, { id: 'agent', type: 'dsh.agent', name: 'Research', config: {}, position: { x: 260, y: 20 } }],
    }, {
      origin: 'agent',
      diagnostics: [{ severity: 'error', code: 'MODEL_REQUIRED', message: 'Choose a model before running', nodeId: 'agent' }],
    })

    await act(async () => root.render(<InspectorPanel />))

    expect(host.textContent).toContain('AI draft review')
    expect(host.textContent).toContain('Choose a model before running')
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Choose a model before running')
    expect(button('Execution').disabled).toBe(true)
    expect(host.textContent).not.toContain('Execution output')

    await act(async () => button('Parameters').click())
    expect(host.querySelector('input')).not.toBeNull()
    expect(host.textContent).toContain('General')

    await act(async () => button('Review').click())
    await act(async () => button('Accept draft').click())
    expect(useFlowStore.getState().review?.status).toBe('accepted')
  })

  it('shows execution evidence only after the selected node has run', async () => {
    const node = useFlowStore.getState().nodes[0]!
    useFlowStore.setState({
      nodes: [{
        ...node,
        data: {
          ...node.data,
          status: 'SUCCESS',
          executionRecord: { nodeId: node.id, status: 'SUCCESS', attempts: 1, output: { ok: true } },
        },
      }],
      inspectorTab: 'execution',
    })

    await act(async () => root.render(<InspectorPanel />))

    expect(button('Execution').disabled).toBe(false)
    expect(host.textContent).toContain('Execution output')
    expect(host.textContent).toContain('"ok": true')
  })
})

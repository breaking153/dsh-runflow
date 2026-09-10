// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { NODE_CATALOG } from '../src/client/catalog.tsx'
import { compatiblePortTypes } from '../src/client/connection-planning.ts'
import { restoreSavedEditorState, useFlowStore } from '../src/client/store.ts'
import type { WorkflowDefinition } from '../src/contracts.ts'
import { connectFlowLocale, relativeTime, translateRunFlow } from '../src/client/locale.ts'
import { DEFAULT_RUNFLOW_WINDOW_MODE } from '../src/client/index.tsx'

describe('RunFlow editor redesign contracts', () => {
  it('opens in fullscreen and localizes relative save times', () => {
    expect(DEFAULT_RUNFLOW_WINDOW_MODE).toBe('maximized')
    expect(relativeTime(undefined, 'zh')).toBe('未保存')
    expect(relativeTime(undefined, 'en')).toBe('Not saved')
  })
  it('tracks the active DSH locale instead of keeping a plugin-local language preference', () => {
    let language = 'zh'
    let notify = (): void => undefined
    const disconnect = connectFlowLocale({ locale: {
      register: () => () => undefined,
      getSnapshot: () => ({ active: language }),
      subscribe: (listener: () => void) => { notify = listener; return () => undefined },
    } } as never)
    expect(translateRunFlow('createWorkflow')).toBe('创建工作流')
    language = 'en'
    notify()
    expect(translateRunFlow('createWorkflow')).toBe('Create workflow')
    disconnect()
  })

  it('uses a dedicated flow signal for triggers and common control nodes', () => {
    const manual = NODE_CATALOG.find(node => node.type === 'trigger.manual')
    const schedule = NODE_CATALOG.find(node => node.type === 'trigger.schedule')
    expect(manual?.outputs).toEqual([expect.objectContaining({ type: 'flow' })])
    expect(schedule?.outputs).toEqual([expect.objectContaining({ type: 'flow' })])
    expect(compatiblePortTypes('flow', 'json')).toBe(false)
    expect(compatiblePortTypes('flow', 'flow')).toBe(true)
  })

  it('ships executable versions of the common workflow utility nodes', () => {
    expect(NODE_CATALOG.map(node => node.type)).toEqual(expect.arrayContaining([
      'builtin.filter',
      'builtin.merge',
      'builtin.limit',
      'builtin.date-time',
      'builtin.noop',
    ]))
    expect(NODE_CATALOG.filter(node => node.type.startsWith('builtin.')).flatMap(node => [
      ...(node.inputs ?? []),
      ...(node.outputs ?? []),
    ]).some(port => port.type === 'any')).toBe(false)
  })

  it('keeps node selection and runtime result while a Host autosave is applied', () => {
    const initial = useFlowStore.getState().definition()
    const definition: WorkflowDefinition = {
      ...initial,
      id: 'selection-save',
      name: 'Selection save',
      nodes: [{ id: 'manual', type: 'trigger.manual', name: 'Manual Trigger', config: {}, position: { x: 20, y: 20 } }],
      edges: [],
    }
    useFlowStore.setState({
      ...useFlowStore.getState(),
      workflowId: definition.id,
      workflowName: definition.name,
      nodes: [{
        id: 'manual', type: 'workflow', position: { x: 20, y: 20 }, selected: true,
        data: {
          label: 'Manual Trigger', nodeType: 'trigger.manual', description: '', color: '#22c55e', icon: 'mouse-pointer-click',
          status: 'SUCCESS', config: {}, inputs: [], outputs: [{ id: 'flow', type: 'flow' }],
          executionRecord: { nodeId: 'manual', status: 'SUCCESS', attempts: 1, output: { ok: true } },
        },
      }],
      edges: [],
      selectedNodeId: 'manual',
      dirty: true,
    })
    const current = useFlowStore.getState()
    const restored = restoreSavedEditorState({ ...definition, updatedAt: '2026-09-01T00:00:00.000Z' }, current)
    const saved = restored.nodes[0]
    expect(saved?.selected).toBe(true)
    expect(saved?.data.status).toBe('SUCCESS')
    expect(saved?.data.executionRecord?.output).toEqual({ ok: true })
    expect(restored.selectedNodeId).toBe('manual')
  })
})

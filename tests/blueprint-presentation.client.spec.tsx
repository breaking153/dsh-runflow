// @vitest-environment jsdom
import * as React from 'react'
import { readFile } from 'node:fs/promises'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowNodeDescriptor } from '../src/contracts.ts'
import { validateWorkflow } from '../src/engine.ts'
import { WorkflowNode } from '../src/client/WorkflowNode.tsx'
import { makeNode, useFlowStore, type FlowNode } from '../src/client/store.ts'
import { descriptorFor } from '../src/client/catalog.tsx'

let host: HTMLDivElement; let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
it('keeps the packaged Host review demo valid with explicit execution continuations', async () => {
  const definition = JSON.parse(await readFile('workflows/pr-review-pipeline-dc662b49.workflow.json', 'utf8')) as WorkflowDefinition
  expect(definition.execution?.semantics).toBe('blueprint')
  expect(validateWorkflow(definition, type => ({ ...descriptorFor(type), execute: async () => null }))).toEqual([])
  expect(definition.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ from: 'script', to: 'agent', sourcePort: 'flow', targetPort: 'flow' }),
    expect.objectContaining({ from: 'agent', to: 'storage', sourcePort: 'flow', targetPort: 'flow' }),
  ]))
})
it('starts the shipped review example with explicit flow continuations and separate script input data', () => {
  const definition = useFlowStore.getState().definition()
  expect(definition.execution?.semantics).toBe('blueprint')
  expect(definition.nodes.some(node => node.type === 'value.json')).toBe(true)
  for (const node of definition.nodes.filter(node => descriptorFor(node.type).executionKind === 'effect')) {
    const inputs = descriptorFor(node.type).inputs ?? []
    expect(definition.edges.some(edge => edge.to === node.id && inputs.some(port => port.id === edge.targetPort && port.type === 'flow')), node.id).toBe(true)
  }
  expect(definition.edges.some(edge => edge.to === 'script' && edge.targetPort === 'json')).toBe(true)
})
async function renderNode(descriptor: WorkflowNodeDescriptor, config = {}) {
  const node = makeNode('test', descriptor.type, { x: 0, y: 0 }, config, undefined, descriptor)
  await act(async () => root.render(<ReactFlowProvider><WorkflowNode {...({ id: node.id, data: node.data, selected: false } as NodeProps<FlowNode>)} /></ReactFlowProvider>))
  return node
}

it('keeps effect flow pins in their own aligned lane before all data pins', async () => {
  const node = await renderNode({ type: 'custom.action', title: 'Action', description: '', category: 'action', color: '#fff', icon: 'workflow', executionKind: 'effect', inputs: [{ id: 'json', type: 'json' }, { id: 'flow', type: 'flow' }], outputs: [{ id: 'result', type: 'json' }, { id: 'done', type: 'flow' }] })
  expect(node.data.executionKind).toBe('effect')
  expect(host.querySelector('.node-kind')?.textContent).toBe('Action')
  const lanes = [...host.querySelectorAll('.node-port-grid')]
  expect(lanes.map(lane => lane.getAttribute('data-lane'))).toEqual(['execution', 'data'])
  expect(lanes[0]?.querySelectorAll('.port-type-flow')).toHaveLength(2)
  expect(lanes[0]?.querySelector('.input-column [data-handleid="flow"]')).not.toBeNull()
  expect(lanes[0]?.querySelector('.output-column [data-handleid="done"]')).not.toBeNull()
  expect(lanes[1]?.querySelector('.port-type-flow')).toBeNull()
})

it.each([{ type: 'boolean', value: false, preview: 'false' }, { type: 'number', value: 0, preview: '0' }, { type: 'json', value: null, preview: 'null' }])('shows compact pure $type values without hiding falsy defaults', async ({ type, value, preview }) => {
  await renderNode({ type: 'value.' + type, title: 'Value', description: '', category: 'data', color: '#fff', icon: 'workflow', executionKind: 'pure', configSchema: { properties: { value: { default: value } } }, inputs: [], outputs: [{ id: 'value', type: type as 'boolean' | 'number' | 'json' }] })
  expect(host.querySelector('.workflow-node.node-kind-pure')).not.toBeNull()
  expect(host.querySelector('.node-kind')?.textContent).toBe('Pure')
  expect(host.querySelector('[data-lane="execution"]')).toBeNull()
  expect(host.querySelector('.node-value-preview')?.textContent).toBe(preview)
})

it('classifies undeclared providers conservatively while recognizing triggers', () => {
  const common = { title: 'Custom', description: '', color: '#fff', icon: 'workflow' }
  expect(makeNode('effect', 'custom', { x: 0, y: 0 }, {}, undefined, { ...common, type: 'custom', category: 'data' }).data.executionKind).toBe('effect')
  expect(makeNode('trigger', 'custom.start', { x: 0, y: 0 }, {}, undefined, { ...common, type: 'custom.start', category: 'trigger' }).data.executionKind).toBe('trigger')
})

it('shows repeated Blueprint visits beside the execution result', async () => {
  const node = makeNode('repeated', 'builtin.noop', { x: 0, y: 0 })
  node.data.executionRecord = { nodeId: node.id, status: 'SUCCESS', attempts: 1, logs: [], artifacts: [], iteration: 2, callId: 'second-call' }
  await act(async () => root.render(<ReactFlowProvider><WorkflowNode {...({ id: node.id, data: node.data } as NodeProps<FlowNode>)} /></ReactFlowProvider>))
  expect(host.querySelector('.node-visit-count')?.textContent).toBe('2 visits')
})

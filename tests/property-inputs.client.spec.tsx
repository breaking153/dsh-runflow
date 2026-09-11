// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PropertyInspector } from '../src/client/Panels.tsx'
import { makeNode, useFlowStore } from '../src/client/store.ts'
import { mergeNodeCatalog, setHostNodeCatalog } from '../src/client/catalog.tsx'
import type { WorkflowNodeDescriptor } from '../src/contracts.ts'
import type { RunFlowGatewayV2 } from '../src/client/application/runflow-gateway.ts'
const runtime = vi.hoisted(() => ({ gateway: undefined as RunFlowGatewayV2 | undefined }))
vi.mock('../src/client/runtime.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/client/runtime.ts')>(), getRunFlowGateway: () => runtime.gateway, getRunFlowClientContext: () => runtime.gateway === undefined ? undefined : { agentId: 'fixture' } }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  runtime.gateway = undefined
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ nodes: [], edges: [], subflows: [], workflows: [], workflowDrafts: new Map(), dirty: false })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); setHostNodeCatalog([]) })

async function inspect(type: string, config = {}, descriptor?: WorkflowNodeDescriptor) {
  const node = makeNode('subject', type, { x: 0, y: 0 }, config, undefined, descriptor)
  useFlowStore.setState({ nodes: [node], selectedNodeId: node.id, ...(descriptor === undefined ? {} : { nodeCatalog: mergeNodeCatalog([descriptor]) }) })
  await act(async () => root.render(<PropertyInspector />))
}
function action(key: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(`button[data-property-key="${key}"]`)
  expect(button, `Adjacent property input action for ${key}`).not.toBeNull()
  return button!
}

describe('property input editing', () => {
  it.each([
    ['value.text', 'input[type="text"]', 'text'], ['value.number', 'input[type="number"]', 'number'],
    ['value.boolean', 'input[type="checkbox"]', 'boolean'], ['value.json', 'textarea', 'any'],
    ['state.get', 'input[type="text"]', 'text'],
  ])('offers a typed editable property for %s with a matching promoted input', async (type, selector, pinType) => {
    await inspect(type!)
    const key = type === 'state.get' ? 'path' : 'value'
    const field = action(key).closest('.property-field')!
    const control = field.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector!)!
    expect(control).not.toBeNull()
    expect(control.disabled).toBe(false)
    await act(async () => action(key).click())
    expect(useFlowStore.getState().nodes[0]?.data.inputs.find(port => port.configKey === key)?.type).toBe(pinType)
  })
  it('promotes an enum beside its editable fallback and restores connected inputs in one undo step', async () => {
    await inspect('http.request', { method: 'POST', url: 'https://example.test' })
    expect(action('method').closest('label')).toBeNull()
    const field = action('method').closest('.property-field')!
    expect(field.querySelector('label')!.htmlFor).toBe(field.querySelector('select')!.id)
    expect(field.querySelector('select')!.id).not.toBe('')
    await act(async () => action('method').click())
    const promoted = useFlowStore.getState().nodes[0]!
    const input = promoted.data.inputs.find(port => port.configKey === 'method')!
    expect(input).toMatchObject({ type: 'text' })
    expect(promoted.data.config.method).toBe('POST')
    expect(host.querySelector('select')?.disabled).toBe(false)
    const source = makeNode('source', 'builtin.json-stringify', { x: -300, y: 0 }, {}, 'Method source')
    await act(async () => useFlowStore.setState(state => ({ nodes: [source, ...state.nodes], edges: [{ id: 'wire', source: 'source', sourceHandle: 'text', target: 'subject', targetHandle: input.id }] })))
    expect(host.textContent).toContain('Method source')
    await act(async () => action('method').click())
    expect(useFlowStore.getState().edges).toHaveLength(0)
    expect(useFlowStore.getState().nodes.find(node => node.id === 'subject')!.data.inputs.some(port => port.configKey === 'method')).toBe(false)
    await act(async () => useFlowStore.getState().undoGraph())
    expect(useFlowStore.getState().edges.map(edge => edge.id)).toEqual(['wire'])
    expect(useFlowStore.getState().definition().nodes.find(node => node.id === 'subject')!.promotedInputs).toEqual(['method'])
    expect(useFlowStore.getState().nodes.find(node => node.id === 'subject')!.data.config.method).toBe('POST')
  })

  it('keeps promotion through persisted reload and clipboard hydration', async () => {
    await inspect('http.request', { url: 'fallback' })
    await act(async () => action('url').click())
    const definition = useFlowStore.getState().definition()
    expect(definition.nodes[0]!.promotedInputs).toEqual(['url'])
    useFlowStore.setState({ workflows: [definition], workflowId: 'other', dirty: false, workflowDrafts: new Map() })
    await act(async () => useFlowStore.getState().openWorkflow(definition.id))
    const restored = useFlowStore.getState().nodes[0]!
    expect(restored.data.inputs.find(port => port.configKey === 'url')?.type).toBe('text')
    await act(async () => { useFlowStore.getState().selectNode(restored.id); useFlowStore.getState().copySelection(); useFlowStore.getState().pasteSelection() })
    expect(useFlowStore.getState().nodes.at(-1)!.data.inputs.find(port => port.configKey === 'url')?.type).toBe('text')
    expect(useFlowStore.getState().nodes.at(-1)!.data.config.url).toBe('fallback')
  })

  it.each([
    ['script.javascript', ['description', 'code']],
    ['dsh.agent', ['agentOptions.model', 'toolFilter.allow', 'outputSchema', 'prompt']],
    ['control.branch', ['source', 'operator', 'value']],
  ])('offers typed inputs on specialized %s fields', async (type, keys) => {
    await inspect(type)
    for (const key of keys) await act(async () => action(key).click())
    expect(useFlowStore.getState().definition().nodes[0]!.promotedInputs).toEqual(keys)
    expect(host.querySelector('button[data-property-key="timeoutMs"]')).toBeNull()
  })

  it('renders eligible provider schema properties with editable JSON, boolean and nested fallbacks', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.properties', title: 'Custom', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { enabled: { type: 'boolean', default: false }, payload: { type: 'array' }, options: { type: 'object', properties: { count: { type: 'integer', default: 0 } } } } } }
    await inspect(descriptor.type, {}, descriptor)
    for (const key of ['enabled', 'payload', 'options.count']) await act(async () => action(key).click())
    expect(useFlowStore.getState().nodes[0]!.data.inputs.map(port => port.type)).toEqual(['boolean', 'json', 'number'])
    expect(host.querySelector('input[type="checkbox"]')).not.toBeNull()
    expect(host.querySelector('textarea')).not.toBeNull()
  })

  it('opens cached custom pins before metadata arrives and recovers typed pins on catalog refresh', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.late', title: 'Late provider', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { count: { type: 'number' } } } }
    await inspect(descriptor.type, { count: 3 }, descriptor)
    await act(async () => action('count').click())
    const definition = useFlowStore.getState().definition()
    await act(async () => useFlowStore.setState({ workflows: [definition], workflowId: 'other', dirty: false, workflowDrafts: new Map(), nodeCatalog: mergeNodeCatalog([]) }))
    await act(async () => useFlowStore.getState().openWorkflow(definition.id))
    expect(useFlowStore.getState().nodes[0]!.data.promotedInputs).toEqual(['count'])
    runtime.gateway = { workspace: { read: async () => ({ nodes: [descriptor], workflows: [definition], executions: [], subagentProviders: [], capabilities: {} }) } } as unknown as RunFlowGatewayV2
    await act(async () => useFlowStore.getState().refreshWorkspace())
    expect(useFlowStore.getState().nodes[0]!.data.inputs.find(port => port.configKey === 'count')?.type).toBe('number')
  })

  it('disconnects an external subflow binding and restores its proxy pin and wire with undo', async () => {
    await inspect('http.request', { url: 'fallback' })
    await act(async () => action('url').click())
    const subject = useFlowStore.getState().nodes[0]!
    const input = subject.data.inputs.find(port => port.configKey === 'url')!
    const source = makeNode('source', 'builtin.json-stringify', { x: -300, y: 0 }, {}, 'URL source')
    const sibling = makeNode('sibling', 'builtin.noop', { x: 300, y: 0 })
    await act(async () => {
      useFlowStore.setState({ nodes: [source, { ...subject, selected: true }, { ...sibling, selected: true }], edges: [{ id: 'boundary', source: 'source', sourceHandle: 'text', target: 'subject', targetHandle: input.id }] })
      useFlowStore.getState().createSubflowFromSelection()
      useFlowStore.getState().enterSubflow(useFlowStore.getState().subflows[0]!.id)
      useFlowStore.getState().selectNode('subject')
    })
    expect(host.textContent).toContain('URL source')
    await act(async () => action('url').click())
    expect(useFlowStore.getState().definition().edges).toHaveLength(0)
    expect(useFlowStore.getState().subflows[0]!.inputs).toHaveLength(0)
    await act(async () => useFlowStore.getState().undoGraph())
    expect(useFlowStore.getState().definition().edges).toEqual([expect.objectContaining({ from: 'source', to: 'subject', targetPort: input.id })])
    expect(useFlowStore.getState().subflows[0]!.inputs).toHaveLength(1)
    await act(async () => useFlowStore.getState().exitSubflow())
    expect(useFlowStore.getState().nodes.find(node => node.type === 'runflow-subflow')!.data.inputs).toHaveLength(1)
  })

  it('preserves explicit null in a schema fallback instead of displaying its default', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.null', title: 'Null', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { value: { default: { example: true } } } } }
    await inspect(descriptor.type, { value: null }, descriptor)
    expect(host.querySelector('textarea')!.value).toBe('null')
  })

  it('prevents conflicting parent and child promotion while allowing the parent to be restored', async () => {
    await inspect('dsh.agent')
    await act(async () => action('agentOptions').click())
    expect(action('agentOptions.model').disabled).toBe(true)
    await act(async () => useFlowStore.getState().setPropertyPromoted('subject', 'agentOptions.model', true))
    expect(useFlowStore.getState().nodes[0]!.data.promotedInputs).toEqual(['agentOptions'])
    await act(async () => action('agentOptions').click())
    expect(action('agentOptions.model').disabled).toBe(false)
  })

  it('defers an omitted input port until a custom property-only descriptor arrives', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.property-only', title: 'Property only', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { label: { type: 'string' } } } }
    const definition = { id: 'late-input', name: 'Late input', version: 1, nodes: [{ id: 'source', type: 'builtin.json-stringify', config: {} }, { id: 'target', type: descriptor.type, config: { label: 'saved' }, promotedInputs: ['label'] }], edges: [{ from: 'source', to: 'target', sourcePort: 'text' }] }
    useFlowStore.setState({ workflows: [definition], workflowId: 'other' })
    await act(async () => useFlowStore.getState().openWorkflow(definition.id))
    expect(useFlowStore.getState().definition().edges[0]!.targetPort).toBeUndefined()
    runtime.gateway = { workspace: { read: async () => ({ nodes: [descriptor], workflows: [definition], executions: [], subagentProviders: [], capabilities: {} }) } } as unknown as RunFlowGatewayV2
    await act(async () => useFlowStore.getState().refreshWorkspace())
    expect(useFlowStore.getState().edges[0]!.targetHandle).toBe('property-label')
    expect(useFlowStore.getState().definition().edges[0]!.targetPort).toBe('property-label')
  })

  it('does not bypass property cardinality when inserting a node from a dangling input drag', async () => {
    await inspect('http.request', { url: 'fallback' })
    await act(async () => action('url').click())
    const input = useFlowStore.getState().nodes[0]!.data.inputs.find(port => port.configKey === 'url')!
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.source', title: 'Source', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [{ id: 'text', type: 'text' }] }
    await act(async () => {
      useFlowStore.setState(state => ({ nodes: [...state.nodes, makeNode('source', descriptor.type, { x: 0, y: 0 }, {}, undefined, descriptor)], edges: [{ id: 'existing', source: 'source', sourceHandle: 'text', target: 'subject', targetHandle: input.id }] }))
      useFlowStore.getState().addConnectedNode(descriptor, { x: -300, y: 0 }, { direction: 'target', nodeId: 'subject', handleId: input.id, portType: 'text' })
    })
    expect(useFlowStore.getState().edges.map(edge => edge.id)).toEqual(['existing'])
  })
})

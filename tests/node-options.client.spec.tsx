// @vitest-environment jsdom
import * as React from 'react'
import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PropertyInspector } from '../src/client/Panels.tsx'
import { connectFlowModelCatalog } from '../src/client/model-catalog.ts'
import { makeNode, useFlowStore } from '../src/client/store.ts'
import { mergeNodeCatalog, setHostNodeCatalog } from '../src/client/catalog.tsx'
import type { JsonObject, WorkflowNodeDescriptor } from '../src/contracts.ts'

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next: T) { value = next; for (const listener of [...listeners]) listener() },
  }
}
const catalog = () => ({
  current: { provider: 'route-a', model: 'model-a' }, routable: true,
  groups: [
    { id: 'route-a', name: 'Route A', models: [{ id: 'model-a', name: 'Model A', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }], defaultEffort: 'high' } }] },
    { id: 'route-b', name: 'Route B', models: [{ id: 'model-b', name: 'Model B', reasoning: { efforts: [{ id: 'medium', name: 'Medium' }], defaultEffort: 'medium' } }] },
  ], failures: [], status: 'ready' as 'ready' | 'loading' | 'error', error: null as string | null,
})
let host: HTMLDivElement
let root: Root
let disconnect: () => void
let directory: ReturnType<typeof observable<ReturnType<typeof catalog>>>
let selectHostModel: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ nodes: [], edges: [], workflows: [], workflowDrafts: new Map(), dirty: false })
  directory = observable(catalog())
  selectHostModel = vi.fn()
  disconnect = connectFlowModelCatalog({
    sessions: { list: observable({ current: 'main-session' }), subagentAddress: () => undefined },
    modelDirectories: { directoryFor: () => ({ store: directory, load: async () => directory.getSnapshot(), select: selectHostModel }) },
  } as unknown as ClientContext)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); disconnect(); vi.clearAllTimers(); vi.useRealTimers(); setHostNodeCatalog([]) })
async function inspect(type: string, config: JsonObject = {}, descriptor?: WorkflowNodeDescriptor) {
  const node = makeNode('subject', type, { x: 0, y: 0 }, config, undefined, descriptor)
  useFlowStore.setState({ nodes: [node], selectedNodeId: node.id, ...(descriptor === undefined ? {} : { nodeCatalog: mergeNodeCatalog([descriptor]) }) })
  await act(async () => root.render(<PropertyInspector />))
}
function dropdown(key: string): HTMLSelectElement {
  const element = host.querySelector<HTMLSelectElement>(`[data-property-field="${key}"] select`)
  expect(element, `Visible choices for ${key}`).not.toBeNull()
  return element!
}
function optionLabels(key: string) { return [...dropdown(key).options].map(option => option.textContent) }
async function choose(key: string, text: string) {
  const element = dropdown(key)
  const option = [...element.options].find(option => option.textContent?.includes(text))
  expect(option, `Option ${text}`).toBeDefined()
  await act(async () => { element.value = option!.value; element.dispatchEvent(new Event('change', { bubbles: true })) })
}
const config = () => useFlowStore.getState().nodes[0]!.data.config

describe('Host-backed node option controls', () => {
  it('shows inherited session models and reasoning without writing defaults or changing the Host model', async () => {
    await inspect('dsh.agent')
    expect(optionLabels('agentOptions.provider').join(' ')).toContain('Route A')
    expect(optionLabels('agentOptions.model').join(' ')).toContain('Model A')
    expect(optionLabels('agentOptions.reasoningEffort').join(' ')).toContain('High')
    expect(config()).toEqual({})
    expect(selectHostModel).not.toHaveBeenCalled()
  })
  it('clears stale nested and legacy model/effort together when the node provider changes', async () => {
    await inspect('dsh.agent', { model: 'legacy-model', reasoningEffort: 'legacy-effort', agentOptions: { provider: 'route-a', model: 'model-a', reasoningEffort: 'high', maxTokens: 42 } })
    await choose('agentOptions.provider', 'Route B')
    expect(config()).toEqual({ agentOptions: { provider: 'route-b', maxTokens: 42 } })
    expect(optionLabels('agentOptions.model').join(' ')).toContain('Model B')
    expect(optionLabels('agentOptions.model').join(' ')).not.toContain('Model A')
    await choose('agentOptions.model', 'Model B')
    expect(optionLabels('agentOptions.reasoningEffort').join(' ')).toContain('Medium')
    expect(selectHostModel).not.toHaveBeenCalled()
  })
  it('keeps unadvertised saved model and effort values visible and editable', async () => {
    await inspect('dsh.agent', { agentOptions: { provider: 'route-a', model: 'private-model', reasoningEffort: 'private-effort' } })
    expect(dropdown('agentOptions.model').selectedOptions[0]!.textContent).toContain('Custom')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Model ID · Custom"]')?.value).toBe('private-model')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reasoning Effort · Custom"]')?.value).toBe('private-effort')
    expect(config().agentOptions).toEqual({ provider: 'route-a', model: 'private-model', reasoningEffort: 'private-effort' })
  })
  it('reacts to the shared catalog changing while preserving explicit node configuration', async () => {
    await inspect('dsh.agent', { agentOptions: { provider: 'route-a', model: 'model-a' } })
    await act(async () => directory.set({ ...catalog(), groups: [catalog().groups[1]!] }))
    expect(optionLabels('agentOptions.provider').join(' ')).toContain('Route B')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Model Provider · Custom"]')?.value).toBe('route-a')
    expect(config().agentOptions).toEqual({ provider: 'route-a', model: 'model-a' })
  })
  it('updates inherited options when the Host session route changes, without freezing it into the node', async () => {
    await inspect('dsh.agent')
    await act(async () => directory.set({ ...catalog(), current: { provider: 'route-b', model: 'model-b' } }))
    expect(optionLabels('agentOptions.model').join(' ')).toContain('Model B')
    expect(optionLabels('agentOptions.reasoningEffort').join(' ')).toContain('Medium')
    expect(config()).toEqual({})
  })
  it('keeps last good choices available after catalog failure and explains an empty successful catalog', async () => {
    await inspect('dsh.agent')
    await act(async () => directory.set({ ...catalog(), status: 'error', error: 'Directory temporarily unavailable' }))
    expect(host.textContent).toContain('Directory temporarily unavailable')
    expect(optionLabels('agentOptions.model').join(' ')).toContain('Model A')
    await act(async () => directory.set({ ...catalog(), groups: [] }))
    expect(host.textContent).toContain('Host 当前没有公布可选模型')
    expect(dropdown('agentOptions.provider').options).toHaveLength(2)
    expect(config()).toEqual({})
  })
  it('offers all standard HTTP methods and preserves a custom method', async () => {
    await inspect('http.request', { method: 'REPORT' })
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) expect(optionLabels('method')).toContain(method)
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Method · Custom"]')?.value).toBe('REPORT')
    await choose('method', 'PATCH')
    expect(config().method).toBe('PATCH')
  })
  it.each(['builtin.condition', 'builtin.filter'])('uses %s declared operators including lessThan', async type => {
    await inspect(type)
    expect(optionLabels('operator').join(' ')).toContain('lessThan')
    await choose('operator', 'lessThan')
    expect(config().operator).toBe('lessThan')
  })
  it('keeps an unknown saved schema enum visible instead of rendering a blank choice', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.mode', title: 'Modes', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['alpha', 'beta'] } } } }
    await inspect(descriptor.type, { mode: 'retired' }, descriptor)
    expect(dropdown('mode').selectedOptions[0]?.textContent).toContain('retired')
    expect(config().mode).toBe('retired')
    await choose('mode', 'beta')
    expect(config().mode).toBe('beta')
  })
  it.each([
    ['http.request', 'method'], ['builtin.condition', 'operator'], ['builtin.sort', 'order'], ['builtin.aggregate', 'operation'],
  ])('shows an empty saved %s option explicitly instead of silently displaying the first valid option', async (type, property) => {
    await inspect(type!, { [property!]: '' })
    expect(dropdown(property!).selectedOptions[0]?.textContent).toContain('Empty value')
    expect(config()[property!]).toBe('')
    expect(useFlowStore.getState().dirty).toBe(false)
  })
  it('labels an unlisted empty string in a schema enum while preserving the original value', async () => {
    const descriptor: WorkflowNodeDescriptor = { type: 'custom.mode', title: 'Modes', description: '', category: 'data', icon: 'braces', color: '#4488cc', inputs: [], outputs: [], configSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['alpha', 'beta'] } } } }
    await inspect(descriptor.type, { mode: '' }, descriptor)
    expect(dropdown('mode').selectedOptions[0]?.textContent).toContain('Empty value')
    expect(config().mode).toBe('')
  })
})

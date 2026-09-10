// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { WebhookSettings } from '../src/client/WebhookSettings.tsx'
import { useFlowStore } from '../src/client/store.ts'
const binding = { id: 'binding', workflowId: 'flow', triggerNodeId: 'hook', path: '/runflow/webhooks/binding', createdAt: '2026-09-10T00:00:00Z' }
const mocks = vi.hoisted(() => ({ read: vi.fn(), enable: vi.fn(), disable: vi.fn(), agentId: 'owner' }))
vi.mock('../src/client/runtime.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/client/runtime.ts')>(), useFlowRuntime: () => ({ connected: true, sessionId: mocks.agentId }), getRunFlowClientContext: () => ({ agentId: mocks.agentId }), getRunFlowGateway: () => ({ webhooks: { read: mocks.read, enable: mocks.enable, disable: mocks.disable } }) }))
let host: HTMLDivElement; let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks(); localStorage.clear(); mocks.agentId = 'owner'
  mocks.read.mockResolvedValue(null); mocks.enable.mockResolvedValue({ binding, token: 'one-time-secret' }); mocks.disable.mockResolvedValue(true)
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ workflowId: 'flow', dirty: false, capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false, triggers: { manual: true, agent: true, webhook: true } } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })
it('shows a token once without persisting it and clears it on workflow changes', async () => {
  await act(async () => root.render(<WebhookSettings triggerNodeId="hook" />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Enable webhook"]')!.click())
  expect(mocks.enable).toHaveBeenCalledWith({ agentId: 'owner' }, 'flow', 'hook')
  expect(host.textContent).toContain('one-time-secret')
  expect(host.textContent).toContain('shown only once')
  expect(JSON.stringify(localStorage)).not.toContain('one-time-secret')
  expect(JSON.stringify(useFlowStore.getState().definition())).not.toContain('one-time-secret')
  await act(async () => useFlowStore.setState({ workflowId: 'other' }))
  expect(host.textContent).not.toContain('one-time-secret')
})
it('explains unavailable webhook capability and disables mutation', async () => {
  useFlowStore.setState({ capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false } })
  await act(async () => root.render(<WebhookSettings triggerNodeId="hook" />))
  expect(host.textContent).toContain('Host web service')
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Enable webhook"]')?.disabled).toBe(true)
  expect(mocks.enable).not.toHaveBeenCalled()
})
it('keeps the current binding visible after a failed revocation and offers retry', async () => {
  mocks.read.mockResolvedValue(binding); mocks.disable.mockRejectedValue(new Error('Connection lost'))
  await act(async () => root.render(<WebhookSettings triggerNodeId="hook" />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Revoke webhook"]')!.click())
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Connection lost')
  expect(host.querySelector<HTMLInputElement>('[aria-label="Webhook endpoint"]')?.value).toContain(binding.path)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Revoke webhook"]')?.disabled).toBe(false)
})
it('does not reveal a late token in another workflow', async () => {
  let resolve!: (value: { binding: typeof binding; token: string }) => void
  mocks.enable.mockReturnValue(new Promise(done => { resolve = done }))
  await act(async () => root.render(<WebhookSettings triggerNodeId="hook" />))
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Enable webhook"]')!.click())
  await act(async () => useFlowStore.setState({ workflowId: 'other' }))
  await act(async () => resolve({ binding, token: 'late-secret' }))
  expect(host.textContent).not.toContain('late-secret')
})

// @vitest-environment jsdom
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { WorkflowExecution } from '../src/contracts.ts'
import { ExecutionDock } from '../src/client/ExecutionDock.tsx'
import { useFlowStore } from '../src/client/store.ts'
const runtime = vi.hoisted(() => ({ gateway: undefined as unknown, agentId: 'owner' }))
vi.mock('../src/client/runtime.ts', async importOriginal => ({ ...await importOriginal<typeof import('../src/client/runtime.ts')>(), getRunFlowGateway: () => runtime.gateway, getRunFlowClientContext: () => ({ agentId: runtime.agentId }) }))
const paused = { id: 'paused', workflowId: 'flow', version: 1, status: 'PAUSED', trigger: 'ui', nodes: [], step: 3, state: { count: 2 }, checkpoint: { interrupts: { review: 'Approve this result?' } } } as unknown as WorkflowExecution
let host: HTMLDivElement; let root: Root
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({ workflowId: 'flow', executions: [paused] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); runtime.gateway = undefined })
it('shows paused runs with their step, prompt and an explicit JSON resume action', async () => {
  const resumeRun = vi.fn(async () => undefined)
  useFlowStore.setState({ resumeRun })
  await act(async () => root.render(<ExecutionDock />))
  expect(host.textContent).toContain('Paused')
  expect(host.textContent).toContain('3 steps')
  await act(async () => host.querySelector<HTMLButtonElement>('.execution-summary')!.click())
  expect(host.textContent).toContain('Approve this result?')
  const input = host.querySelector<HTMLTextAreaElement>('[aria-label="Resume input · JSON"]')!
  expect(input).not.toBeNull()
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '{bad'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Resume paused"]')!.click())
  expect(resumeRun).not.toHaveBeenCalled()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('JSON')
})
it('resumes the existing execution without saving an edited workflow or starting a new run', async () => {
  const resume = vi.fn(async () => ({ executionId: paused.id, execution: { ...paused, status: 'SUCCESS' } }))
  const start = vi.fn(); const save = vi.fn()
  runtime.gateway = { executions: { resume, start }, workspace: { read: vi.fn(async () => { throw new Error('not loaded') }) } }
  useFlowStore.setState({ dirty: true, save })
  await useFlowStore.getState().resumeRun(paused.id, { approved: true })
  expect(resume).toHaveBeenCalledWith({ agentId: 'owner' }, paused.id, { approved: true })
  expect(start).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled()
  expect(useFlowStore.getState().executions[0]?.status).toBe('SUCCESS')
  expect(useFlowStore.getState().dirty).toBe(true)
})
it('ignores a resume response after the main session changes', async () => {
  let resolve!: (value: unknown) => void
  runtime.gateway = { executions: { resume: () => new Promise(done => { resolve = done }) } }
  const pending = useFlowStore.getState().resumeRun(paused.id, true)
  runtime.agentId = 'other-owner'
  resolve({ executionId: paused.id, execution: { ...paused, status: 'SUCCESS' } })
  await pending
  expect(useFlowStore.getState().executions[0]?.status).toBe('PAUSED')
  runtime.agentId = 'owner'
})

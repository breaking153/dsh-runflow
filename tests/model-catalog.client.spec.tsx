import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  connectFlowModelCatalog,
  getFlowModelCatalogSnapshot,
  modelsForProvider,
} from '../src/client/model-catalog.ts'

function observable<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: T) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

const readyDirectory = () => observable({
  current: { provider: 'deepseek', model: 'deepseek-chat' },
  routable: true,
  groups: [{
    id: 'deepseek',
    name: 'DeepSeek',
    models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }],
  }],
  failures: [],
  status: 'ready' as const,
  error: null,
})

afterEach(() => {
  expect(getFlowModelCatalogSnapshot().sessionId).toBeUndefined()
})

describe('Flow client model catalog bridge', () => {
  it('follows the current main session and publishes official directory updates', async () => {
    const sessions = observable({ current: 'session-a' })
    const directory = readyDirectory()
    const load = vi.fn(async () => directory.getSnapshot())
    const ctx = {
      sessions: {
        list: sessions,
        subagentAddress: () => undefined,
      },
      modelDirectories: {
        directoryFor: vi.fn(() => ({ store: directory, load })),
      },
    } as unknown as ClientContext

    const disconnect = connectFlowModelCatalog(ctx)
    await Promise.resolve()

    expect(load).toHaveBeenCalledOnce()
    expect(getFlowModelCatalogSnapshot()).toMatchObject({
      sessionId: 'session-a',
      status: 'ready',
      current: { provider: 'deepseek', model: 'deepseek-chat' },
    })
    expect(modelsForProvider(getFlowModelCatalogSnapshot(), 'deepseek')).toEqual([
      expect.objectContaining({ id: 'deepseek-chat' }),
    ])

    directory.set({
      ...directory.getSnapshot(),
      groups: [{ id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-test', name: 'GPT Test' }] }],
    })
    expect(modelsForProvider(getFlowModelCatalogSnapshot(), 'openai')).toEqual([
      expect.objectContaining({ id: 'gpt-test' }),
    ])

    disconnect()
  })

  it('keeps manual configuration available for addressed subagent sessions', () => {
    const sessions = observable({ current: 'child-session' })
    const directoryFor = vi.fn()
    const ctx = {
      sessions: {
        list: sessions,
        subagentAddress: () => ({ parentSessionId: 'parent', subagentId: 'child' }),
      },
      modelDirectories: { directoryFor },
    } as unknown as ClientContext

    const disconnect = connectFlowModelCatalog(ctx)

    expect(directoryFor).not.toHaveBeenCalled()
    expect(getFlowModelCatalogSnapshot()).toMatchObject({
      sessionId: 'child-session',
      status: 'error',
    })
    expect(getFlowModelCatalogSnapshot().error).toContain('手工输入')

    disconnect()
  })
})

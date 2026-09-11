// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as cordis from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inject as runFlowInject } from '../src/client/index.tsx'
import { connectFlowModelCatalog, getFlowModelCatalogSnapshot } from '../src/client/model-catalog.ts'

function snapshotStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  const store = {
    getSnapshot: () => value,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(next: T) {
      value = next
      for (const listener of [...listeners]) listener()
    },
    update(change: (draft: T) => void) {
      const draft = structuredClone(value)
      change(draft)
      store.set(draft)
    },
  }
  return store
}

// DSH ships browser services as ModuleLoader bundles, not importable Node modules.
// Execute the installed SDK unchanged: only wire responses and UI/store plumbing are fixtures.
const require = createRequire(import.meta.url)
let sdk: typeof import('@deepseek-ai/dsh-client-ui-model-selection/client')
new Function('window', readFileSync(require.resolve('@deepseek-ai/dsh-client-ui-model-selection/client'), 'utf8'))({
  __ModuleLoader__: {
    load({ factory }: { factory: (require: (id: string) => unknown) => typeof sdk }) {
      sdk = factory(id => {
        if (id === '@deepseek-ai/cordis') return cordis
        if (id === '@deepseek-ai/dsh-client-store') return { createSnapshotStore: snapshotStore }
        if (id === '@deepseek-ai/dsh-client-ui-primitives') return {}
        return require(id)
      })
    },
  },
})

const contexts: cordis.Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

async function setup() {
  const ctx = new cordis.Context()
  contexts.push(ctx)
  const events = new Map<string, () => void>()
  class Remote extends cordis.Service {
    constructor(inner: cordis.Context) { super(inner, 'remote') }
    $on(event: string, listener: () => void) {
      events.set(event, listener)
      return () => events.delete(event)
    }
  }
  await ctx.plugin(Remote)
  const current = { provider: 'test-provider', model: 'test-model' }
  const catalog = {
    default: current,
    routableProviders: ['test-provider'],
    groups: [{ id: 'test-provider', name: 'Test provider', models: [{ id: 'test-model', name: 'Test model' }] }],
    failures: [],
  }
  const modelCatalog = vi.fn(async () => ({ ok: true, value: catalog }))
  const selectModel = vi.fn()
  const sessions = snapshotStore({ current: 'session-a' })
  const projection = snapshotStore({ next: null })
  // Sibling providers are essential: root-provided fixtures bypass Cordis inject checks.
  await ctx.plugin((provider: cordis.Context) => {
    provider.provide('remote.session', { modelCatalog, selectModel } as never)
    provider.provide('sessions', {
      list: sessions,
      subagentAddress: () => undefined,
      scope: () => ctx,
      binding: () => ({ session: { projections: { faceOf: () => projection } } }),
    } as never)
    for (const key of ['slots', 'locale']) provider.provide(key, {} as never)
  })
  await ctx.plugin(sdk.ModelDirectoryResolver, { blockReason: () => 'Unavailable provider' })
  return { ctx, catalog, modelCatalog, selectModel, events, sessions }
}

function connect(ctx: cordis.Context, inject: string[]) {
  return ctx.plugin({
    inject,
    apply(inner: cordis.Context) {
      inner.effect(() => connectFlowModelCatalog(inner), 'test: RunFlow model bridge')
    },
  })
}

describe('RunFlow catalog through the installed DSH SDK and Cordis service boundary', () => {
  it('loads a previously unresolved directory with the actual client injection declaration', async () => {
    const { ctx, selectModel, modelCatalog } = await setup()
    await connect(ctx, runFlowInject)

    await vi.waitFor(() => expect(getFlowModelCatalogSnapshot()).toMatchObject({
      status: 'ready',
      error: null,
      sessionId: 'session-a',
      current: { provider: 'test-provider', model: 'test-model' },
      groups: [{ id: 'test-provider', models: [{ id: 'test-model' }] }],
    }))
    expect(modelCatalog).toHaveBeenCalledOnce()
    expect(selectModel).not.toHaveBeenCalled()
  })

  it('reproduces the namespace denial when the consumer only injects remote', async () => {
    const { ctx } = await setup()
    await connect(ctx, runFlowInject.filter(key => key !== 'remote.session'))
    expect(getFlowModelCatalogSnapshot()).toMatchObject({
      status: 'error',
      error: 'cannot get property "remote.session" without inject',
    })
  })

  it('uses official adapter refresh events and current-session changes without changing the Host selection', async () => {
    const { ctx, catalog, modelCatalog, selectModel, events, sessions } = await setup()
    await connect(ctx, runFlowInject)
    await vi.waitFor(() => expect(getFlowModelCatalogSnapshot().status).toBe('ready'))

    catalog.groups[0]!.models.push({ id: 'second-model', name: 'Second model' })
    events.get('llm/adapters-updated')!()
    await vi.waitFor(() => expect(getFlowModelCatalogSnapshot().groups[0]?.models).toHaveLength(2))
    sessions.set({ current: 'session-b' })
    await vi.waitFor(() => expect(getFlowModelCatalogSnapshot()).toMatchObject({
      status: 'ready', sessionId: 'session-b', error: null,
    }))
    expect(modelCatalog).toHaveBeenCalledTimes(2)
    expect(selectModel).not.toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import type { RunFlowWorkspaceSnapshot } from '../src/remote-contract.ts'
import type { RunFlowGatewayV2 } from '../src/client/application/runflow-gateway.ts'
import { makeNode, useFlowStore } from '../src/client/store.ts'

const runtime = vi.hoisted(() => ({
  agentId: 'session-a',
  gateway: undefined as RunFlowGatewayV2 | undefined,
}))
vi.mock('../src/client/runtime.ts', () => ({
  getRunFlowGateway: () => runtime.gateway,
  getRunFlowClientContext: () => runtime.gateway === undefined ? undefined : { agentId: runtime.agentId },
}))

function definition(id: string): WorkflowDefinition {
  return { id, name: id.toUpperCase(), version: 1, nodes: [{ id: 'manual', type: 'trigger.manual', config: {}, position: { x: 20, y: 20 } }], edges: [] }
}

function workspace(workflows: WorkflowDefinition[]): RunFlowWorkspaceSnapshot {
  return { apiVersion: 2, workflows, executions: [], nodes: [], subagentProviders: [], capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const hostFiles = new Map<string, WorkflowDefinition>()
let write: (draft: WorkflowDefinition) => Promise<WorkflowDefinition>

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  sessionStorage.clear()
  hostFiles.clear()
  runtime.agentId = 'session-a'
  write = async draft => ({ ...draft, version: draft.version + 1, updatedAt: '2026-09-09T00:00:00.000Z' })
  runtime.gateway = {
    version: 2,
    workspace: { read: vi.fn() },
    workflows: {
      save: async (_context, draft) => {
        const saved = await write(draft)
        hostFiles.set(saved.id, saved)
        return saved
      },
      delete: vi.fn(async () => true),
    },
    webhooks: { read: vi.fn(), enable: vi.fn(), disable: vi.fn() },
    executions: { resume: vi.fn(), start: vi.fn(), read: vi.fn(), cancel: vi.fn() },
    sources: { list: vi.fn(), save: vi.fn() },
    reviews: { read: vi.fn(), accept: vi.fn() },
  }
  useFlowStore.setState(useFlowStore.getInitialState(), true)
  useFlowStore.setState({
    workflows: [definition('a'), definition('b')], openWorkflowIds: ['a', 'b'],
    workflowId: 'a', workflowName: 'A', version: 1,
    nodes: [makeNode('manual', 'trigger.manual', { x: 20, y: 20 })], edges: [],
    subflows: [], dirty: false, savedAt: undefined, view: 'editor',
  })
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('workflow draft persistence', () => {
  it('keeps edits and selection when the active workflow is opened again', () => {
    useFlowStore.getState().setWorkflowName('Unsaved title')
    useFlowStore.getState().selectNode('manual')
    useFlowStore.getState().openWorkflow('a')

    expect(useFlowStore.getState().workflowName).toBe('Unsaved title')
    expect(useFlowStore.getState().selectedNodeId).toBe('manual')
    expect(useFlowStore.getState().dirty).toBe(true)
  })

  it('reopens the active workflow tab without discarding its draft', () => {
    useFlowStore.setState({ openWorkflowIds: [], workflowName: 'Open draft', dirty: true })
    useFlowStore.getState().openWorkflow('a')
    expect(useFlowStore.getState().openWorkflowIds).toEqual(['a'])
    expect(useFlowStore.getState().workflowName).toBe('Open draft')
  })

  it('restores the latest draft when switching back before the Host save finishes', async () => {
    const pending = deferred<WorkflowDefinition>()
    let sent!: WorkflowDefinition
    write = draft => { sent = draft; return pending.promise }
    useFlowStore.getState().setWorkflowName('Draft A')
    useFlowStore.getState().openWorkflow('b')
    useFlowStore.getState().openWorkflow('a')

    expect(useFlowStore.getState().workflowName).toBe('Draft A')
    expect(useFlowStore.getState().dirty).toBe(true)
    pending.resolve({ ...sent, version: 2 })
    await vi.advanceTimersByTimeAsync(0)
    expect(useFlowStore.getState().workflowName).toBe('Draft A')
    expect(useFlowStore.getState().dirty).toBe(false)
  })

  it('keeps a tab open and its draft available when the Host rejects a close-time save', async () => {
    write = async () => { throw new Error('Host disk unavailable') }
    useFlowStore.getState().setWorkflowName('Recoverable draft')
    await useFlowStore.getState().closeWorkflowTab('a')

    expect(useFlowStore.getState().openWorkflowIds).toContain('a')
    expect(useFlowStore.getState().workflowName).toBe('Recoverable draft')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(useFlowStore.getState().saveError).toContain('Host disk unavailable')
  })

  it('serializes saves so an older write cannot become the final Host file', async () => {
    const first = deferred<WorkflowDefinition>()
    let firstDraft!: WorkflowDefinition
    const started: string[] = []
    write = draft => {
      started.push(draft.name)
      if (started.length === 1) { firstDraft = draft; return first.promise }
      return Promise.resolve({ ...draft, version: 3 })
    }
    useFlowStore.getState().setWorkflowName('Older edit')
    const oldSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('Newest edit')
    const newSave = useFlowStore.getState().save()
    expect(started).toEqual(['Older edit'])

    first.resolve({ ...firstDraft, version: 2 })
    await Promise.all([oldSave, newSave])
    expect(hostFiles.get('a')?.name).toBe('Newest edit')
    expect(useFlowStore.getState().workflowName).toBe('Newest edit')
    expect(useFlowStore.getState().dirty).toBe(false)
  })

  it('shares an in-flight save when navigation flushes the same unchanged draft again', async () => {
    const pending = deferred<WorkflowDefinition>()
    let sent!: WorkflowDefinition
    let writes = 0
    write = draft => { writes++; sent = draft; return pending.promise }
    useFlowStore.getState().setWorkflowName('One meaningful edit')
    const autosave = useFlowStore.getState().save()
    const flush = useFlowStore.getState().save()
    pending.resolve({ ...sent, version: 2 })
    await Promise.all([autosave, flush])
    expect(writes).toBe(1)
    expect(useFlowStore.getState().dirty).toBe(false)
  })

  it('saves a local undo after an intermediate queued write reaches the Host', async () => {
    const first = deferred<WorkflowDefinition>()
    const middle = deferred<WorkflowDefinition>()
    let firstDraft!: WorkflowDefinition
    let middleDraft!: WorkflowDefinition
    let writes = 0
    write = draft => {
      if (++writes === 1) { firstDraft = draft; return first.promise }
      if (writes === 2) { middleDraft = draft; return middle.promise }
      return Promise.resolve({ ...draft, version: 4 })
    }
    useFlowStore.getState().setWorkflowName('A edit')
    const firstSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('B edit')
    const middleSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('A edit')
    first.resolve({ ...firstDraft, version: 2 })
    await firstSave
    middle.resolve({ ...middleDraft, version: 3 })
    await middleSave
    await vi.advanceTimersByTimeAsync(350)
    expect(hostFiles.get('a')?.name).toBe('A edit')
    expect(useFlowStore.getState().workflowName).toBe('A edit')
    expect(useFlowStore.getState().dirty).toBe(false)
  })

  it('preserves a local undo when navigating away between queued save acknowledgements', async () => {
    const first = deferred<WorkflowDefinition>()
    const middle = deferred<WorkflowDefinition>()
    let firstDraft!: WorkflowDefinition
    let middleDraft!: WorkflowDefinition
    let writes = 0
    write = draft => {
      if (++writes === 1) { firstDraft = draft; return first.promise }
      if (writes === 2) { middleDraft = draft; return middle.promise }
      return Promise.resolve({ ...draft, version: 4 })
    }
    useFlowStore.getState().setWorkflowName('A edit')
    const firstSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('B edit')
    const middleSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('A edit')
    first.resolve({ ...firstDraft, version: 2 })
    await firstSave
    useFlowStore.getState().openWorkflow('b')
    middle.resolve({ ...middleDraft, version: 3 })
    await middleSave
    await vi.advanceTimersByTimeAsync(350)
    useFlowStore.getState().openWorkflow('a')
    expect(useFlowStore.getState().workflowName).toBe('A edit')
    expect(hostFiles.get('a')?.name).toBe('A edit')
  })

  it('retains a failed final undo save even when its content matched an earlier successful save', async () => {
    const first = deferred<WorkflowDefinition>()
    let firstDraft!: WorkflowDefinition
    let writes = 0
    write = draft => {
      if (++writes === 1) { firstDraft = draft; return first.promise }
      if (writes === 2) return Promise.resolve({ ...draft, version: 3 })
      return Promise.reject(new Error('Final save failed'))
    }
    useFlowStore.getState().setWorkflowName('A edit')
    const firstSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('B edit')
    const middleSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('A edit')
    const lastSave = useFlowStore.getState().save()
    first.resolve({ ...firstDraft, version: 2 })
    await firstSave
    useFlowStore.getState().openWorkflow('b')
    await Promise.all([middleSave, lastSave])
    useFlowStore.getState().openWorkflow('a')
    expect(hostFiles.get('a')?.name).toBe('B edit')
    expect(useFlowStore.getState().workflowName).toBe('A edit')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(useFlowStore.getState().saveError).toContain('Final save failed')
  })

  it('does not replace a newer inactive draft with a late save response', async () => {
    const first = deferred<WorkflowDefinition>()
    const second = deferred<WorkflowDefinition>()
    let firstDraft!: WorkflowDefinition
    let secondDraft!: WorkflowDefinition
    let count = 0
    write = draft => {
      if (++count === 1) { firstDraft = draft; return first.promise }
      secondDraft = draft
      return second.promise
    }
    useFlowStore.getState().setWorkflowName('Older edit')
    const saving = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('Latest inactive edit')
    useFlowStore.getState().openWorkflow('b')
    first.resolve({ ...firstDraft, version: 2 })
    await saving
    useFlowStore.getState().openWorkflow('a')

    expect(useFlowStore.getState().workflowName).toBe('Latest inactive edit')
    expect(useFlowStore.getState().dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    second.resolve({ ...secondDraft, version: 3 })
    await vi.advanceTimersByTimeAsync(0)
  })

  it('ignores late save responses from the previously active DSH session', async () => {
    const pending = deferred<WorkflowDefinition>()
    let sent!: WorkflowDefinition
    write = draft => { sent = draft; return pending.promise }
    useFlowStore.getState().setWorkflowName('Session A edit')
    const saving = useFlowStore.getState().save()
    runtime.agentId = 'session-b'
    useFlowStore.setState({ workflowName: 'Session B edit', dirty: true })
    pending.resolve({ ...sent, version: 5 })
    await saving
    await vi.advanceTimersByTimeAsync(500)

    expect(useFlowStore.getState().workflowName).toBe('Session B edit')
    expect(useFlowStore.getState().version).toBe(1)
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(localStorage.getItem('dsh-runflow:workflows')).not.toContain('"version":5')
  })

  it('keeps pending draft names and cached content while refreshing the Host workspace', async () => {
    const pending = deferred<WorkflowDefinition>()
    let sent!: WorkflowDefinition
    write = draft => { sent = draft; return pending.promise }
    runtime.gateway!.workspace.read = async () => workspace([definition('a'), definition('b')])
    useFlowStore.getState().setWorkflowName('Pending draft')
    const saving = useFlowStore.getState().save()
    useFlowStore.getState().openWorkflow('b')
    await useFlowStore.getState().refreshWorkspace()
    expect(useFlowStore.getState().workflows.find(item => item.id === 'a')?.name).toBe('Pending draft')
    expect(JSON.parse(localStorage.getItem('dsh-runflow:workflows')!).find((item: WorkflowDefinition) => item.id === 'a').name).toBe('Pending draft')
    pending.resolve({ ...sent, version: 2 })
    await saving
  })

  it('ignores workspace responses after the active DSH session changes', async () => {
    const pending = deferred<RunFlowWorkspaceSnapshot>()
    runtime.gateway!.workspace.read = () => pending.promise
    const refreshing = useFlowStore.getState().refreshWorkspace()
    runtime.agentId = 'session-b'
    useFlowStore.setState({ workflows: [definition('b')], workspaceLoading: false })
    pending.resolve(workspace([definition('a')]))
    await refreshing
    expect(useFlowStore.getState().workflows.map(item => item.id)).toEqual(['b'])
    expect(localStorage.getItem('dsh-runflow:workflows')).toBeNull()
  })

  it('applies only the newest requested workspace snapshot', async () => {
    const old = deferred<RunFlowWorkspaceSnapshot>()
    runtime.gateway!.workspace.read = () => old.promise
    const olderRefresh = useFlowStore.getState().refreshWorkspace()
    runtime.gateway!.workspace.read = async () => workspace([{ ...definition('b'), name: 'Latest Host name' }])
    await useFlowStore.getState().refreshWorkspace()
    old.resolve(workspace([{ ...definition('b'), name: 'Outdated Host name' }]))
    await olderRefresh
    expect(useFlowStore.getState().workflows.find(item => item.id === 'b')?.name).toBe('Latest Host name')
  })

  it('can save to the Host when the optional browser cache has no quota', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('No quota', 'QuotaExceededError') })
    useFlowStore.getState().setWorkflowName('Host durable edit')
    await useFlowStore.getState().save()

    expect(hostFiles.get('a')?.name).toBe('Host durable edit')
    expect(useFlowStore.getState().dirty).toBe(false)
    expect(useFlowStore.getState().saveError).toBeUndefined()
  })

  it('keeps offline edits dirty if browser storage cannot persist them', async () => {
    runtime.gateway = undefined
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('No quota', 'QuotaExceededError') })
    useFlowStore.getState().setWorkflowName('Offline unsaved edit')
    await useFlowStore.getState().save()

    expect(useFlowStore.getState().workflowName).toBe('Offline unsaved edit')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(useFlowStore.getState().saveError).toBeTruthy()
  })

  it('can switch workflows when session storage is disabled', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError') })
    expect(() => useFlowStore.getState().openWorkflow('b')).not.toThrow()
    expect(useFlowStore.getState().workflowId).toBe('b')
  })

  it('deletes only after earlier saves settle so their writes cannot recreate the workflow', async () => {
    const pending = deferred<WorkflowDefinition>()
    let sent!: WorkflowDefinition
    const operations: string[] = []
    write = draft => { sent = draft; operations.push('save'); return pending.promise }
    runtime.gateway!.workflows.delete = async (_context, id) => { operations.push('delete'); return hostFiles.delete(id) }
    useFlowStore.getState().setWorkflowName('Before deletion')
    const saving = useFlowStore.getState().save()
    const deleting = useFlowStore.getState().deleteWorkflow('a')
    expect(operations).toEqual(['save'])
    pending.resolve({ ...sent, version: 2 })
    await Promise.all([saving, deleting])
    expect(operations).toEqual(['save', 'delete'])
    expect(hostFiles.has('a')).toBe(false)
    expect(useFlowStore.getState().workflows.some(item => item.id === 'a')).toBe(false)
    expect(useFlowStore.getState().openWorkflowIds).not.toContain('a')
  })

  it('blocks saves while a workflow is being deleted and after deletion succeeds', async () => {
    const pending = deferred<boolean>()
    const savedNames: string[] = []
    write = async draft => { savedNames.push(draft.name); return draft }
    runtime.gateway!.workflows.delete = () => pending.promise
    const deleting = useFlowStore.getState().deleteWorkflow('a')
    useFlowStore.getState().setWorkflowName('Edited during deletion')
    await useFlowStore.getState().save()
    expect(savedNames).toEqual([])
    pending.resolve(true)
    await deleting
    useFlowStore.setState({ dirty: true })
    await useFlowStore.getState().save()
    expect(savedNames).toEqual([])
    expect(useFlowStore.getState().workflows.some(item => item.id === 'a')).toBe(false)
  })

  it('keeps the editor draft after a failed deletion and allows a successful retry', async () => {
    const pending = deferred<boolean>()
    runtime.gateway!.workflows.delete = () => pending.promise
    const deleting = useFlowStore.getState().deleteWorkflow('a')
    useFlowStore.getState().setWorkflowName('Recover after delete failure')
    pending.reject(new Error('Host deletion failed'))
    await deleting
    expect(useFlowStore.getState().workflowName).toBe('Recover after delete failure')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(useFlowStore.getState().openWorkflowIds).toContain('a')
    expect(useFlowStore.getState().workspaceError).toContain('Host deletion failed')
    await useFlowStore.getState().save()
    expect(hostFiles.get('a')?.name).toBe('Recover after delete failure')
    runtime.gateway!.workflows.delete = async (_context, id) => hostFiles.delete(id)
    await useFlowStore.getState().deleteWorkflow('a')
    expect(hostFiles.has('a')).toBe(false)
    expect(useFlowStore.getState().workflows.some(item => item.id === 'a')).toBe(false)
    expect(useFlowStore.getState().workspaceError).toBeUndefined()
  })

  it('preserves an unsaved undo when deletion fails after intermediate writes and navigation', async () => {
    const first = deferred<WorkflowDefinition>()
    const middle = deferred<WorkflowDefinition>()
    const removal = deferred<boolean>()
    let firstDraft!: WorkflowDefinition
    let middleDraft!: WorkflowDefinition
    let writes = 0
    write = draft => {
      if (++writes === 1) { firstDraft = draft; return first.promise }
      middleDraft = draft
      return middle.promise
    }
    runtime.gateway!.workflows.delete = () => removal.promise
    useFlowStore.getState().setWorkflowName('A edit')
    const firstSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('B edit')
    const middleSave = useFlowStore.getState().save()
    useFlowStore.getState().setWorkflowName('A edit')
    const deleting = useFlowStore.getState().deleteWorkflow('a')
    first.resolve({ ...firstDraft, version: 2 })
    await firstSave
    useFlowStore.getState().openWorkflow('b')
    middle.resolve({ ...middleDraft, version: 3 })
    await middleSave
    removal.reject(new Error('Deletion failed'))
    await deleting
    useFlowStore.getState().openWorkflow('a')
    expect(useFlowStore.getState().workflowName).toBe('A edit')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(hostFiles.get('a')?.name).toBe('B edit')
  })

  it('ignores a deletion response from the previously active DSH session', async () => {
    const pending = deferred<boolean>()
    runtime.gateway!.workflows.delete = () => pending.promise
    const deleting = useFlowStore.getState().deleteWorkflow('a')
    runtime.agentId = 'session-b'
    useFlowStore.setState({ workflowName: 'Session B draft', dirty: true })
    await useFlowStore.getState().save()
    pending.resolve(true)
    await deleting
    expect(useFlowStore.getState().workflowName).toBe('Session B draft')
    expect(useFlowStore.getState().workflows.some(item => item.id === 'a')).toBe(true)
    expect(useFlowStore.getState().openWorkflowIds).toContain('a')
    expect(useFlowStore.getState().workspaceError).toBeUndefined()
  })

  it('keeps an offline workflow open when browser storage cannot persist its deletion', async () => {
    runtime.gateway = undefined
    useFlowStore.setState({ workflowName: 'Offline draft', dirty: true })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    await useFlowStore.getState().deleteWorkflow('a')
    expect(useFlowStore.getState().workflows.some(item => item.id === 'a')).toBe(true)
    expect(useFlowStore.getState().openWorkflowIds).toContain('a')
    expect(useFlowStore.getState().workflowName).toBe('Offline draft')
    expect(useFlowStore.getState().dirty).toBe(true)
    expect(useFlowStore.getState().workspaceError).toBeTruthy()
  })
})

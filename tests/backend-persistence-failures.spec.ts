import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import { FileWorkflowRepository } from '../src/backend/v2/file-repositories.ts'
import { FlowNodeLibrary, type NodeDraftInput } from '../src/node-library.ts'

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
    renameSync: vi.fn(actual.renameSync),
    unlinkSync: vi.fn(actual.unlinkSync),
  }
})

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), unlink: vi.fn(actual.unlink) }
})

const roots: string[] = []
const draft = (program = 'first revision'): NodeDraftInput => ({
  descriptor: {
    type: 'test.persistence', title: 'Persistence probe', description: 'Local test fixture',
    category: 'data', color: '#2563EB', icon: 'test', inputs: [], outputs: [],
  },
  program,
})
const passed: WorkflowExecution = {
  id: 'local-test', workflowId: 'node-test', version: 1, status: 'SUCCESS', trigger: 'test', nodes: [],
}
const workflow: WorkflowDefinition = {
  id: 'local-workflow', name: 'Original', version: 1,
  nodes: [{ id: 'fixture', type: 'test.fixture', config: {} }], edges: [],
}

async function directory(): Promise<string> {
  const root = await fsp.mkdtemp(join(tmpdir(), 'runflow-persistence-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(roots.splice(0).map(root => fsp.rm(root, { recursive: true, force: true })))
})

describe('durable state on filesystem failure', () => {
  it('keeps the last saved draft in memory and on disk when replacement fails', async () => {
    const root = await directory()
    const library = new FlowNodeLibrary(root, async () => null)
    const original = library.upsertDraft(draft())
    const content = await fsp.readFile(original.path!, 'utf8')
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error('replacement refused') })

    expect(() => library.upsertDraft(draft('new revision'))).toThrow('replacement refused')
    expect(await fsp.readFile(original.path!, 'utf8')).toBe(content)
    expect(library.get('test.persistence')?.revision).toBe(original.revision)
    expect(await fsp.readdir(library.draftsDir)).toEqual(['test.persistence.node.json'])
  })

  it('does not retain a passing test receipt when persisting it fails', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    vi.mocked(fs.writeFileSync).mockImplementationOnce(() => { throw new Error('disk full') })

    expect(() => library.markTested('test.persistence', passed)).toThrow('disk full')
    expect(library.get('test.persistence')?.testedRevision).toBeUndefined()
    await expect(library.commit('test.persistence')).rejects.toThrow('must pass')
  })

  it('preserves the previous committed node when its replacement fails', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    const committed = await library.commit('test.persistence')
    const content = await fsp.readFile(committed.path!, 'utf8')
    const edited = library.upsertDraft(draft('new revision'))
    library.markTested('test.persistence', passed)
    vi.mocked(fsp.rename).mockRejectedValueOnce(new Error('replacement refused'))

    await expect(library.commit('test.persistence')).rejects.toThrow('replacement refused')
    expect(await fsp.readFile(committed.path!, 'utf8')).toBe(content)
    expect(library.get('test.persistence')).toMatchObject({ source: 'memory', revision: edited.revision })
    expect(await fsp.readdir(library.nodesDir)).toEqual(['.drafts', 'test.persistence.node.json'])
  })

  it('preserves a newer draft created while an earlier revision is being committed', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.rename).mockImplementationOnce(async (from, to) => {
      entered.resolve()
      await release.promise
      await actual.rename(from, to)
    })
    const committing = library.commit('test.persistence')
    await entered.promise
    const edited = library.upsertDraft(draft('newer untested revision'))
    // Run the watcher's reload at a deterministic point before the pending write completes.
    ;(library as unknown as { reloadPersisted(): void }).reloadPersisted()
    release.resolve()
    await committing

    expect(library.get('test.persistence')).toMatchObject({ source: 'memory', revision: edited.revision })
    expect(new FlowNodeLibrary(library.nodesDir, async () => null).get('test.persistence'))
      .toMatchObject({ source: 'memory', revision: edited.revision })
  })

  it('finishes a commit when a watcher reloads the unchanged draft during the write', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    const committing = library.commit('test.persistence')
    ;(library as unknown as { reloadPersisted(): void }).reloadPersisted()
    const committed = await committing

    expect(committed.source).toBe('local')
    expect(library.get('test.persistence')).toMatchObject({ source: 'local', revision: committed.revision })
    expect(new FlowNodeLibrary(library.nodesDir, async () => null).get('test.persistence'))
      .toMatchObject({ source: 'local', revision: committed.revision })
    expect(await fsp.readdir(library.draftsDir)).toEqual([])
  })

  it('finishes removal when a watcher reloads the unchanged committed node', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    await library.commit('test.persistence')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.unlink).mockImplementationOnce(async path => {
      entered.resolve()
      await release.promise
      await actual.unlink(path)
    })
    const removing = library.removePersisted('test.persistence')
    await entered.promise
    ;(library as unknown as { reloadPersisted(): void }).reloadPersisted()
    release.resolve()
    expect(await removing).toBe(true)

    expect(library.get('test.persistence')).toBeUndefined()
    expect(new FlowNodeLibrary(library.nodesDir, async () => null).get('test.persistence')).toBeUndefined()
  })

  it('rejects overlapping commits for the same node so an older write cannot replace a newer commit', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.rename).mockImplementationOnce(async (from, to) => {
      entered.resolve()
      await release.promise
      await actual.rename(from, to)
    })
    const first = library.commit('test.persistence')
    await entered.promise
    const edited = library.upsertDraft(draft('newer tested revision'))
    library.markTested('test.persistence', passed)
    const overlappingError = await library.commit('test.persistence').then(() => undefined, error => error)
    release.resolve()
    await first

    expect(overlappingError).toBeInstanceOf(Error)
    expect(overlappingError.message).toMatch(/commit.*in progress/i)
    const committed = await library.commit('test.persistence')
    expect(committed.revision).toBe(edited.revision)
    expect(new FlowNodeLibrary(library.nodesDir, async () => null).get('test.persistence'))
      .toMatchObject({ source: 'local', revision: edited.revision })
  })

  it('keeps a new draft visible when removal of the previous committed node finishes', async () => {
    const library = new FlowNodeLibrary(await directory(), async () => null)
    library.upsertDraft(draft())
    library.markTested('test.persistence', passed)
    await library.commit('test.persistence')
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    vi.mocked(fsp.unlink).mockImplementationOnce(async path => {
      entered.resolve()
      await release.promise
      await actual.unlink(path)
    })
    const removing = library.removePersisted('test.persistence')
    await entered.promise
    const edited = library.upsertDraft(draft('new draft'))
    release.resolve()
    expect(await removing).toBe(true)

    expect(library.get('test.persistence')).toMatchObject({ source: 'memory', revision: edited.revision })
    expect(new FlowNodeLibrary(library.nodesDir, async () => null).get('test.persistence'))
      .toMatchObject({ source: 'memory', revision: edited.revision })
  })

  it('removes a partially written temporary repository file after a write failure', async () => {
    const root = await directory()
    const repository = new FileWorkflowRepository(root)
    repository.save(workflow)
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
    vi.mocked(fs.writeFileSync).mockImplementationOnce(path => {
      actual.writeFileSync(path, 'partial')
      throw new Error('disk full')
    })

    expect(() => repository.save({ ...workflow, name: 'Unsaved' })).toThrow('disk full')
    expect(repository.get(workflow.id)?.name).toBe('Original')
    expect(new FileWorkflowRepository(root).get(workflow.id)?.name).toBe('Original')
    expect(await fsp.readdir(root)).toEqual([expect.stringMatching(/\.workflow\.json$/)])
  })

  it('keeps a repository record visible when deleting its file fails', async () => {
    const root = await directory()
    const repository = new FileWorkflowRepository(root)
    repository.save(workflow)
    vi.mocked(fs.unlinkSync).mockImplementationOnce(() => { throw new Error('file busy') })

    expect(() => repository.delete(workflow.id)).toThrow('file busy')
    expect(repository.get(workflow.id)).toEqual(workflow)
    expect(new FileWorkflowRepository(root).get(workflow.id)).toEqual(workflow)
  })
})

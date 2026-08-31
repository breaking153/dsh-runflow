import { mkdir, mkdtemp, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { DirectoryPluginLoader } from '../src/directory-plugin-loader.ts'
import { FlowService } from '../src/flow-service.ts'

const roots: string[] = []

function pluginSource(title: string, delayMs = 0, signalStart = false): string {
  return `export async function apply(ctx) {
    const dispose = ctx.flow.registerNode({
      type: 'hot.example', title: ${JSON.stringify(title)}, description: 'hot provider',
      category: 'action', color: '#2563EB', icon: 'flame', inputs: [],
      outputs: [{ id: 'output', type: 'json' }], async execute() { return { ok: true } }
    })
    ${signalStart ? `globalThis.__runflowLoaderStarted?.(${JSON.stringify(title)})` : ''}
    ${delayMs > 0 ? `await new Promise(resolve => setTimeout(resolve, ${delayMs}))` : ''}
    return dispose
  }
  `
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('RunFlow directory Cordis plugin loader', () => {
  it('loads, reloads, and unloads a file-backed Node plugin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-file-plugin-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const path = join(nodesDir, 'example.node.mjs')
    await mkdir(nodesDir, { recursive: true })
    await writeFile(path, pluginSource('Version one'), 'utf8')
    const ctx = new Context()
    new FlowService(ctx, {
      nodesDir,
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })
    const loader = new DirectoryPluginLoader(ctx, {
      directory: nodesDir,
      suffixes: ['.node.mjs'],
      label: 'test node loader',
      watch: false,
    })
    await loader.start()
    expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Version one')

    await writeFile(path, pluginSource('Version number two'), 'utf8')
    await loader.scan()
    expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Version number two')

    await unlink(path)
    await loader.scan()
    expect(ctx.flow.node('hot.example')).toBeUndefined()
    await loader.dispose()
  })

  it('reloads same-size content even when file timestamps are unchanged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-content-hash-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const path = join(nodesDir, 'example.node.mjs')
    const timestamp = new Date('2024-01-02T03:04:05.000Z')
    await mkdir(nodesDir, { recursive: true })
    const first = pluginSource('Version one')
    const second = pluginSource('Version two')
    expect(Buffer.byteLength(second)).toBe(Buffer.byteLength(first))
    await writeFile(path, first, 'utf8')
    await utimes(path, timestamp, timestamp)
    const ctx = new Context()
    new FlowService(ctx, {
      nodesDir,
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })
    const loader = new DirectoryPluginLoader(ctx, {
      directory: nodesDir,
      suffixes: ['.node.mjs'],
      label: 'content hash loader',
      watch: false,
    })
    await loader.start()

    await writeFile(path, second, 'utf8')
    await utimes(path, timestamp, timestamp)
    const metadata = await stat(path)
    expect(metadata.size).toBe(Buffer.byteLength(first))
    expect(metadata.mtimeMs).toBe(timestamp.getTime())
    await loader.scan()

    expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Version two')
    await loader.dispose()
  })

  it('serializes overlapping scans and commits the latest saved generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-serialized-loader-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const path = join(nodesDir, 'example.node.mjs')
    await mkdir(nodesDir, { recursive: true })
    await writeFile(path, pluginSource('Version one'), 'utf8')
    const ctx = new Context()
    new FlowService(ctx, {
      nodesDir,
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })
    const loader = new DirectoryPluginLoader(ctx, {
      directory: nodesDir,
      suffixes: ['.node.mjs'],
      label: 'serialized loader',
      watch: false,
    })
    await loader.start()

    let announceStart!: (title: string) => void
    const started = new Promise<string>(resolve => { announceStart = resolve })
    const testGlobal = globalThis as typeof globalThis & { __runflowLoaderStarted?: (title: string) => void }
    testGlobal.__runflowLoaderStarted = announceStart
    try {
      await writeFile(path, pluginSource('Version two', 40, true), 'utf8')
      const firstScan = loader.scan()
      await expect(started).resolves.toBe('Version two')
      await writeFile(path, pluginSource('Version three'), 'utf8')
      const coalescedScan = loader.scan()
      await Promise.all([firstScan, coalescedScan])
      expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Version three')
    } finally {
      delete testGlobal.__runflowLoaderStarted
      await loader.dispose()
    }
  })

  it('keeps the last known-good plugin when the latest file cannot import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-loader-rollback-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const path = join(nodesDir, 'example.script.mjs')
    await mkdir(nodesDir, { recursive: true })
    await writeFile(path, pluginSource('Script one'), 'utf8')
    const ctx = new Context()
    new FlowService(ctx, {
      nodesDir,
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })
    const loader = new DirectoryPluginLoader(ctx, {
      directory: nodesDir,
      suffixes: ['.script.mjs'],
      label: 'test script loader',
      watch: false,
    })
    await loader.start()

    await writeFile(path, 'export function apply( {', 'utf8')
    await loader.scan()
    expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Script one')

    await writeFile(path, pluginSource('Script two'), 'utf8')
    await loader.scan()
    expect(ctx.flow.node('hot.example')?.descriptor.title).toBe('Script two')

    await unlink(path)
    await loader.scan()
    expect(ctx.flow.node('hot.example')).toBeUndefined()
    await loader.dispose()
  })

  it('automatically reloads a watched file without a manual scan', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-watched-loader-'))
    roots.push(root)
    const nodesDir = join(root, 'nodes')
    const path = join(nodesDir, 'example.node.mjs')
    await mkdir(nodesDir, { recursive: true })
    await writeFile(path, pluginSource('Watched one'), 'utf8')
    const ctx = new Context()
    new FlowService(ctx, {
      nodesDir,
      storageDir: join(root, 'workspace'),
      workflowsDir: join(root, 'workflows'),
      watchFiles: false,
    })
    const loader = new DirectoryPluginLoader(ctx, {
      directory: nodesDir,
      suffixes: ['.node.mjs'],
      label: 'watched loader',
      watch: true,
    })
    await loader.start()

    await writeFile(path, pluginSource('Watched two'), 'utf8')
    await expect.poll(
      () => ctx.flow.node('hot.example')?.descriptor.title,
      { timeout: 2_000, interval: 25 },
    ).toBe('Watched two')
    await loader.dispose()
  })
})

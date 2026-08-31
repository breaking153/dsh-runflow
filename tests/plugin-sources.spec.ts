import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { RunFlowPluginSourceLibrary } from '../src/plugin-sources.ts'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))))

describe('trusted Node/Script source library', () => {
  it('persists constrained plugin files and versions them by content hash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runflow-sources-'))
    roots.push(root)
    const library = new RunFlowPluginSourceLibrary(join(root, 'nodes'), join(root, 'script'))
    const first = library.save({ kind: 'node', name: 'sample.node.ts', content: 'export default { apply() {} }\n' })
    const second = library.save({ kind: 'node', name: 'sample.node.ts', content: 'export default { apply(ctx) { void ctx } }\n' })
    const script = library.save({ kind: 'script', name: 'bridge.script.ts', content: 'export default { apply() {} }\n' })

    expect(first.version).not.toBe(second.version)
    expect(library.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'node', name: 'sample.node.ts', version: second.version }),
      expect.objectContaining({ kind: 'script', name: 'bridge.script.ts', version: script.version }),
    ]))
  })

  it('rejects traversal, suffix confusion, and oversized source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'runflow-sources-'))
    roots.push(root)
    const library = new RunFlowPluginSourceLibrary(join(root, 'nodes'), join(root, 'script'))
    expect(() => library.save({ kind: 'node', name: '../escape.node.ts', content: 'x' })).toThrow('plain')
    expect(() => library.save({ kind: 'script', name: 'wrong.node.ts', content: 'x' })).toThrow('.script.')
    expect(() => library.save({ kind: 'node', name: 'large.node.ts', content: 'x'.repeat(513 * 1024) })).toThrow('512 KiB')
  })
})

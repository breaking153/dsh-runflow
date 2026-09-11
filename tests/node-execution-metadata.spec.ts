import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import type { WorkflowNodeDefinition } from '../src/contracts.ts'
import { FlowNodeLibrary } from '../src/node-library.ts'

it('validates execution metadata for plugin/builtin/draft providers while retaining provider identity', async () => {
  const path = await mkdtemp(join(tmpdir(), 'runflow-execution-metadata-'))
  try {
    const library = new FlowNodeLibrary(path, async () => null)
    const original: WorkflowNodeDefinition = { type: 'custom.effect', title: 'Effect', description: 'Effect', category: 'action',
      color: '#123456', icon: 'test', inputs: [], outputs: [{ id: 'value', type: 'json' }, { id: 'flow', type: 'flow' }],
      executionKind: 'effect', completionPort: 'flow', execute: async () => 1 }
    const unregister = library.registerPlugin(original)
    expect(library.resolve(original.type)).toBe(original)
    expect(library.list()[0]?.descriptor.completionPort).toBe('flow')
    unregister()
    expect(library.resolve(original.type)).toBeUndefined()
    for (const register of [
      (definition: WorkflowNodeDefinition) => library.registerPlugin(definition),
      (definition: WorkflowNodeDefinition) => library.registerBuiltin(definition),
      ({ execute: _execute, ...descriptor }: WorkflowNodeDefinition) => library.upsertDraft({ descriptor, program: 'return 1' }),
    ]) {
      expect(() => register({ ...original, completionPort: 'value' })).toThrow('completionPort')
      expect(() => register({ ...original, executionKind: 'pure' })).toThrow('Pure node')
      expect(library.resolve(original.type)).toBeUndefined()
    }
  } finally { await rm(path, { recursive: true, force: true }) }
})

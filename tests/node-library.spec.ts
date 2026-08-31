import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkflowExecution } from '../src/contracts.ts'
import { FlowNodeLibrary } from '../src/node-library.ts'

function successfulExecution(): WorkflowExecution {
  return {
    id: 'test-execution',
    workflowId: 'node-test',
    version: 1,
    status: 'SUCCESS',
    trigger: 'node-test',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    nodes: [{ nodeId: 'under-test', status: 'SUCCESS', attempts: 1 }],
  }
}

describe('RunFlow node library', () => {
  it('requires the current in-memory revision to pass before solidifying it', async () => {
    const nodesDir = await mkdtemp(join(tmpdir(), 'dsh-runflow-nodes-'))
    const executeProgram = async () => ({ ok: true })
    try {
      const library = new FlowNodeLibrary(nodesDir, executeProgram)
      const draft = library.upsertDraft({
        descriptor: {
          type: 'custom.extract-risk',
          title: 'Extract risk',
          description: 'Extract normalized risk records.',
          category: 'data',
          color: '#2563EB',
          icon: 'scan-search',
          inputs: [{ id: 'source', type: 'json', required: true }],
          outputs: [
            { id: 'records', type: 'table' },
            { id: 'summary', type: 'text' },
          ],
        },
        program: 'return {$runflow:"port-outputs",outputs:{records:[],summary:"ok"}}',
      })
      expect(draft.path).toContain('.drafts')
      expect(existsSync(draft.path!)).toBe(true)
      const restoredDraft = new FlowNodeLibrary(nodesDir, executeProgram).get('custom.extract-risk')
      expect(restoredDraft).toEqual(expect.objectContaining({ source: 'memory', persisted: false }))
      await expect(library.commit('custom.extract-risk')).rejects.toThrow('must pass')

      const receipt = library.markTested('custom.extract-risk', successfulExecution())
      expect(receipt.passed).toBe(true)
      expect(receipt.revision).toBe(draft.revision)

      const committed = await library.commit('custom.extract-risk')
      expect(committed).toEqual(expect.objectContaining({ source: 'local', persisted: true }))
      expect(existsSync(draft.path!)).toBe(false)

      const reloaded = new FlowNodeLibrary(nodesDir, executeProgram)
      expect(reloaded.get('custom.extract-risk')).toEqual(expect.objectContaining({
        source: 'local',
        persisted: true,
        program: expect.stringContaining('port-outputs'),
      }))
      expect(await reloaded.removePersisted('custom.extract-risk')).toBe(true)
      expect(reloaded.get('custom.extract-risk')).toBeUndefined()
    } finally {
      await rm(nodesDir, { recursive: true, force: true })
    }
  })
})

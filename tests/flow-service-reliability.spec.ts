import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { JsonValue } from '../src/contracts.ts'
import { FlowService } from '../src/flow-service.ts'
import type { NodeDraftInput } from '../src/node-library.ts'

const contexts: Context[] = []
const roots: string[] = []

async function service(runProgram: () => Promise<JsonValue>): Promise<FlowService> {
  const root = await mkdtemp(join(tmpdir(), 'runflow-service-reliability-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  ctx.provide('flowNodeExecutor', { runProgram })
  return new FlowService(ctx, {
    nodesDir: join(root, 'nodes'), scriptsDir: join(root, 'scripts'),
    outputDir: join(root, 'output'), storageDir: join(root, 'storage'), watchFiles: false,
  })
}

const draft = (program = 'test revision one'): NodeDraftInput => ({
  descriptor: {
    type: 'test.revision', title: 'Revision probe', description: 'Local test fixture',
    category: 'data', color: '#2563EB', icon: 'test', inputs: [], outputs: [],
  },
  program,
})

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('FlowService execution boundaries', () => {
  it('forwards cancellation that happened before a draft test was requested', async () => {
    let executed = false
    const flow = await service(async () => { executed = true; return null })
    flow.upsertNodeDraft(draft())

    const receipt = await flow.testNodeDraft('test.revision', {
      agentId: 'local-fixture', signal: AbortSignal.abort('cancelled before request'),
    })

    expect(receipt.execution.status).toBe('CANCELLED')
    expect(receipt.execution.error).toBe('cancelled before request')
    expect(receipt.passed).toBe(false)
    expect(executed).toBe(false)
    expect(flow.node('test.revision')?.testedRevision).toBeUndefined()
    expect(flow.cancel(receipt.execution.id)).toBe(false)
  })

  it('does not certify a draft edited while its previous revision was being tested', async () => {
    const entered = Promise.withResolvers<void>()
    const result = Promise.withResolvers<JsonValue>()
    const flow = await service(async () => { entered.resolve(); return await result.promise })
    flow.upsertNodeDraft(draft())
    const testing = flow.testNodeDraft('test.revision', { agentId: 'local-fixture' })
    const rejected = expect(testing).rejects.toThrow(/revision.*changed|changed.*revision/i)
    await entered.promise
    const edited = flow.upsertNodeDraft(draft('test revision two'))
    result.resolve(null)

    await rejected
    expect(flow.node('test.revision')).toMatchObject({ revision: edited.revision, source: 'memory' })
    expect(flow.node('test.revision')?.testedRevision).toBeUndefined()
    await expect(flow.commitNodeDraft('test.revision')).rejects.toThrow('must pass')
  })
})

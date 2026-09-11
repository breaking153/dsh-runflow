import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import type { JsonObject, WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import { isExecutionDocument, isWorkflowDocument } from '../src/backend/v2/document-validation.ts'
import { executeWorkflow, validateWorkflow, type WorkflowEngineOptions } from '../src/engine.ts'
import { FileExecutionOutput } from '../src/output-store.ts'

const providers = builtinNodeDefinitions(async () => { throw new Error('Packaged demos must not require model credentials') })
const engine: WorkflowEngineOptions = { maxParallelNodes: 4, defaultTimeoutMs: 1000,
  resolveNode: type => providers.find(node => node.type === type) }

async function load(name: string): Promise<WorkflowDefinition> {
  const path = new URL('../examples/workflows/demo-' + name + '.workflow.json', import.meta.url)
  expect(existsSync(path), 'Packaged runnable demo is missing: ' + name).toBe(true)
  const definition = JSON.parse(await readFile(path, 'utf8')) as WorkflowDefinition
  expect(isWorkflowDocument(definition)).toBe(true)
  expect(validateWorkflow(definition, engine.resolveNode)).toEqual([])
  return definition
}

async function withArtifacts(definition: WorkflowDefinition, run: (runtime: WorkflowEngineOptions) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'runflow-demo-artifacts-'))
  try { await run({ ...engine, createOutput: execution => new FileExecutionOutput(directory, definition, execution) }) }
  finally { await rm(directory, { recursive: true, force: true }) }
}

const visits = (execution: WorkflowExecution, id: string) => execution.steps?.flatMap(step => step.nodes).filter(node => node.nodeId === id) ?? []
const expectSuccess = (execution: WorkflowExecution): void => {
  expect(execution.status, execution.error ?? JSON.stringify(execution.nodes)).toBe('SUCCESS')
  expect(isExecutionDocument(execution)).toBe(true)
}

afterEach(() => vi.unstubAllGlobals())

describe('packaged workflow demos', () => {
  it('filters active records, sorts by score, limits to two, and writes those exact records to a real artifact', async () => {
    const definition = await load('data-pipeline')
    await withArtifacts(definition, async runtime => {
      const execution = await executeWorkflow(definition, {}, runtime)
      expectSuccess(execution)
      const expected = [
        { id: 'RF-103', title: 'Repair export', active: true, score: 97 },
        { id: 'RF-101', title: 'Improve search', active: true, score: 91 },
      ]
      expect(execution.output).toEqual(expect.objectContaining({ stored: true, collection: 'demo-top-items', value: expected }))
      expect(JSON.parse(await readFile((execution.output as JsonObject).path as string, 'utf8'))).toEqual(expected)
      for (const id of ['demo-data-source', 'demo-data-filter', 'demo-data-sort', 'demo-data-limit']) {
        expect(visits(execution, id)).toHaveLength(1)
        expect(visits(execution, id)[0]?.evaluatedFor).toBe('demo-data-storage')
      }
    })
  })

  it.each([
    { allowed: true, selected: 'approved', skipped: 'review', output: { decision: 'approved', next: 'publish' } },
    { allowed: false, selected: 'review', skipped: 'approved', output: { decision: 'review', next: 'manual-review' } },
  ])('runs only the $selected outcome when the editable flag is $allowed', async ({ allowed, selected, skipped, output }) => {
    const definition = await load('conditional-branch')
    definition.nodes.find(node => node.id === 'demo-branch-flag')!.config.value = allowed
    const execution = await executeWorkflow(definition, {}, engine)
    expectSuccess(execution)
    expect(execution.output).toEqual(output)
    expect(visits(execution, 'demo-branch-' + selected)).toHaveLength(1)
    expect(execution.nodes.find(node => node.nodeId === 'demo-branch-' + skipped)?.status).toBe('SKIPPED')
  })

  it.each([
    { entryNodeIds: undefined, count: 2 },
    { entryNodeIds: ['demo-http-start-a'], count: 1 },
    { entryNodeIds: ['demo-http-start-b'], count: 1 },
  ])('uses promoted URL and shared HTTP/Storage/continuation for $count independent call(s)', async ({ entryNodeIds, count }) => {
    const definition = await load('shared-http')
    const requests: { url: string; method: string; body: unknown }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as unknown
      requests.push({ url, method: String(init.method), body })
      return new Response(JSON.stringify({ ok: true, method: init.method, path: '/echo', body }), { status: 200, headers: { 'content-type': 'application/json' } })
    })
    await withArtifacts(definition, async runtime => {
      const execution = await executeWorkflow(definition, entryNodeIds === undefined ? {} : { entryNodeIds }, runtime)
      expectSuccess(execution)
      expect(requests).toHaveLength(count)
      for (const request of requests) expect(request).toEqual({ url: 'http://127.0.0.1:18947/echo', method: 'POST', body: { demo: 'shared-http', message: 'Hello RunFlow' } })
      const calls = visits(execution, 'demo-http-request')
      expect(calls).toHaveLength(count)
      expect(new Set(calls.map(call => call.callId)).size).toBe(count)
      for (const id of ['demo-http-storage', 'demo-http-continue', 'demo-http-end']) expect(visits(execution, id)).toHaveLength(count)
      const expected = { ok: true, method: 'POST', path: '/echo', body: { demo: 'shared-http', message: 'Hello RunFlow' } }
      for (const record of visits(execution, 'demo-http-storage')) {
        expect(record.output).toEqual(expect.objectContaining({ stored: true, collection: 'demo-http-responses', value: expected }))
        expect(JSON.parse(await readFile((record.output as JsonObject).path as string, 'utf8'))).toEqual(expected)
      }
      expect((execution.output as JsonObject).value).toEqual(expected)
    })
  })

  it('stops the shared HTTP chain before Storage or continuation on a server error', async () => {
    const definition = await load('shared-http')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: false, error: 'Demo failure' }), { status: 503, headers: { 'content-type': 'application/json' } }))
    const execution = await executeWorkflow(definition, { entryNodeIds: ['demo-http-start-a'] }, engine)
    expect(execution.status).toBe('FAILED')
    expect(execution.error).toContain('HTTP 503')
    expect(visits(execution, 'demo-http-storage')).toHaveLength(0)
    expect(visits(execution, 'demo-http-continue')).toHaveLength(0)
  })

  it.each([true, false])('commits three loop increments, pauses, then returns state with approved=%s after serialized resume', async approved => {
    const definition = await load('loop-approval')
    const paused = await executeWorkflow(definition, {}, engine)
    expect(paused.status, paused.error).toBe('PAUSED')
    expect(paused.state).toEqual({ count: 3 })
    expect(visits(paused, 'demo-loop-increment')).toHaveLength(3)
    expect(visits(paused, 'demo-loop-counter')).toHaveLength(4)
    expect(paused.nodes.find(node => node.nodeId === 'demo-loop-approval')?.status).toBe('PAUSED')
    expect(isExecutionDocument(paused)).toBe(true)
    const resumed = await executeWorkflow(definition, {
      checkpoint: JSON.parse(JSON.stringify(paused.checkpoint)), resumeValues: { 'demo-loop-approval': approved },
    }, engine)
    expectSuccess(resumed)
    expect(resumed.output).toEqual({ count: 3, approved })
    expect(visits(resumed, 'demo-loop-increment')).toHaveLength(3)
    expect(visits(resumed, 'demo-loop-result')[0]?.evaluatedFor).toBe('demo-loop-end')
  })
})

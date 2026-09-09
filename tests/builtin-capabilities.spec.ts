import { describe, expect, it, vi } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import type {
  ExecutionArtifact,
  JsonValue,
  NodeExecutionContext,
  WorkflowNodeDefinition,
} from '../src/contracts.ts'

function node(type: string): WorkflowNodeDefinition {
  const definition = builtinNodeDefinitions(async () => ({ agent: true }))
    .find(candidate => candidate.type === type)
  if (definition === undefined) throw new Error('missing builtin ' + type)
  return definition
}

function context(
  type: string,
  config: Record<string, JsonValue>,
  input: JsonValue,
  writeIntermediate: NodeExecutionContext['writeIntermediate'],
  inputs: Record<string, JsonValue> = {},
): NodeExecutionContext {
  return {
    executionId: 'execution-1',
    agentId: 'agent-1',
    workflow: { id: 'flow', name: 'Flow', version: 1, nodes: [], edges: [] },
    node: { id: 'node-1', type, config },
    input,
    inputs,
    vars: {},
    signal: new AbortController().signal,
    outputDir: 'output/runflow/flow/execution-1/nodes/node-1',
    intermediateDir: 'output/runflow/flow/execution-1/intermediate/node-1',
    log: vi.fn(),
    writeIntermediate,
  }
}

describe('real builtin node capabilities', () => {
  it('emits a typed flow signal and routes named inputs through common utility nodes', async () => {
    const writeIntermediate = vi.fn()
    const trigger = await node('trigger.manual').execute(context('trigger.manual', {}, { orderId: 7 }, writeIntermediate))
    expect(trigger).toEqual(expect.objectContaining({ $runflow: 'flow', trigger: 'manual', payload: { orderId: 7 } }))

    const merged = await node('builtin.merge').execute(context(
      'builtin.merge', {}, {}, writeIntermediate, { left: { first: true }, right: { second: true } },
    ))
    expect(merged).toEqual({ first: true, second: true })
  })

  it('does not advertise trigger listeners that are not installed', () => {
    expect(node('trigger.manual').available).not.toBe(false)
    expect(node('trigger.webhook').available).toBe(false)
    expect(node('trigger.schedule').available).toBe(false)
    expect(node('trigger.dsh-event').available).toBe(false)
  })

  it('persists Storage input through the execution output writer', async () => {
    const artifact: ExecutionArtifact = {
      kind: 'intermediate',
      label: 'storage-results',
      path: 'output/runflow/flow/execution-1/intermediate/node-1/001-storage-results.json',
      mediaType: 'application/json',
    }
    const writeIntermediate = vi.fn(async () => artifact)
    const result = await node('storage.write').execute(context(
      'storage.write',
      { collection: 'results' },
      { answer: 42 },
      writeIntermediate,
    ))

    expect(writeIntermediate).toHaveBeenCalledWith('storage-results', { answer: 42 }, 'output')
    expect(result).toEqual(expect.objectContaining({
      stored: true,
      collection: 'results',
      path: artifact.path,
      value: { answer: 42 },
    }))
  })

  it('dispatches HTTP requests with real headers and JSON body', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(
      JSON.stringify({ accepted: true }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const writeIntermediate = vi.fn(async (): Promise<ExecutionArtifact> => ({
      kind: 'intermediate',
      label: 'response-body',
      path: 'memory://response',
      mediaType: 'application/json',
    }))

    const result = await node('http.request').execute(context(
      'http.request',
      {
        url: 'https://example.test/jobs',
        method: 'POST',
        headers: { authorization: 'Bearer token' },
      },
      { task: 'review' },
      writeIntermediate,
    ))

    expect(fetchMock).toHaveBeenCalledOnce()
    const request = fetchMock.mock.calls[0]?.[1]
    expect(request).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer token',
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ task: 'review' }),
    }))
    expect(result).toEqual({
      $runflow: 'port-outputs',
      outputs: {
        body: { accepted: true },
        status: 201,
        headers: { 'content-type': 'application/json' },
      },
    })
    vi.unstubAllGlobals()
  })

  it('routes Switch values through named match and fallback outputs', async () => {
    const writeIntermediate = vi.fn()
    const matched = await node('builtin.switch').execute(context(
      'builtin.switch',
      { rules: [{ path: 'priority', operator: 'equals', value: 'high' }] },
      { priority: 'high', id: 7 },
      writeIntermediate,
    ))
    const fallback = await node('builtin.switch').execute(context(
      'builtin.switch',
      { rules: [{ path: 'priority', operator: 'equals', value: 'high' }] },
      { priority: 'low', id: 8 },
      writeIntermediate,
    ))

    expect(matched).toEqual({ $runflow: 'port-outputs', outputs: { match: { priority: 'high', id: 7 }, index: 0 } })
    expect(fallback).toEqual({ $runflow: 'port-outputs', outputs: { fallback: { priority: 'low', id: 8 }, index: -1 } })
  })

  it('provides typed Sort, Aggregate, and JSON transform nodes', async () => {
    const writeIntermediate = vi.fn()
    await expect(node('builtin.sort').execute(context(
      'builtin.sort', { path: 'score', order: 'desc' },
      [{ score: 2 }, { score: 9 }, { score: 4 }], writeIntermediate,
    ))).resolves.toEqual([{ score: 9 }, { score: 4 }, { score: 2 }])

    await expect(node('builtin.aggregate').execute(context(
      'builtin.aggregate', { operation: 'average', path: 'score' },
      [{ score: 2 }, { score: 8 }], writeIntermediate,
    ))).resolves.toEqual({ $runflow: 'port-outputs', outputs: { result: 5, items: [{ score: 2 }, { score: 8 }] } })

    const parsed = await node('builtin.json-parse').execute(context(
      'builtin.json-parse', {}, '{"ready":true}', writeIntermediate,
    ))
    expect(parsed).toEqual({ ready: true })
    await expect(node('builtin.json-stringify').execute(context(
      'builtin.json-stringify', { pretty: true }, parsed, writeIntermediate,
    ))).resolves.toBe('{\n  "ready": true\n}')
  })

  it('advertises the v2 utility catalog with concrete port types', () => {
    const catalog = builtinNodeDefinitions(async () => ({ agent: true }))
    expect(catalog.map(item => item.type)).toEqual(expect.arrayContaining([
      'builtin.switch', 'builtin.sort', 'builtin.aggregate',
      'builtin.json-parse', 'builtin.json-stringify', 'builtin.wait', 'builtin.stop-error',
    ]))
    for (const definition of catalog.filter(item => item.type.startsWith('builtin.'))) {
      expect([...(definition.inputs ?? []), ...(definition.outputs ?? [])].every(port => port.type !== 'any')).toBe(true)
    }
  })
})

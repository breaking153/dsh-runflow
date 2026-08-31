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
): NodeExecutionContext {
  return {
    executionId: 'execution-1',
    agentId: 'agent-1',
    workflow: { id: 'flow', name: 'Flow', version: 1, nodes: [], edges: [] },
    node: { id: 'node-1', type, config },
    input,
    inputs: {},
    vars: {},
    signal: new AbortController().signal,
    outputDir: 'output/runflow/flow/execution-1/nodes/node-1',
    intermediateDir: 'output/runflow/flow/execution-1/intermediate/node-1',
    log: vi.fn(),
    writeIntermediate,
  }
}

describe('real builtin node capabilities', () => {
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
})

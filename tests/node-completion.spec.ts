import { describe, expect, it } from 'vitest'
import type { JsonValue, NodeControlEnvelope, WorkflowDefinition, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'

const provider = (execute: WorkflowNodeDefinition['execute'], extra: Partial<WorkflowNodeDefinition> & { completionPort?: string } = {}): WorkflowNodeDefinition => ({
  type: 'action', title: 'Action', description: 'Action', category: 'action', color: '#123456', icon: 'test',
  inputs: [{ id: 'input', type: 'flow' }], outputs: [{ id: 'result', type: 'json' }, { id: 'flow', type: 'flow' }],
  executionKind: 'effect', completionPort: 'flow', execute, ...extra,
})
const graph = (mode: 'dag' | 'state-graph', edges: WorkflowDefinition['edges'] = []): WorkflowDefinition => ({
  id: 'completion', name: 'Completion', version: 1, execution: { mode },
  nodes: [{ id: 'action', type: 'action', config: {} }, ...(edges.length ? [{ id: 'sink', type: 'sink', config: {} }] : [])], edges,
})
const fallbackSink = (): WorkflowNodeDefinition => {
  const sink = provider(async ({ input }) => input, { type: 'sink', outputs: [{ id: 'output', type: 'json' }] })
  delete sink.completionPort
  return sink
}
const engine = (action: WorkflowNodeDefinition, sink = fallbackSink()) => ({
  maxParallelNodes: 2, defaultTimeoutMs: 1000, resolveNode: (type: string) => type === 'action' ? action : sink,
})

describe.each(['dag', 'state-graph'] as const)('%s successful completion', mode => {
  it.each([null, false, 0, '', { output: 'plain data', flow: 'literal field' }] satisfies JsonValue[])(
    'adds completion without changing raw primary or terminal output %j', async value => {
      const result = await executeWorkflow(graph(mode), {}, engine(provider(async () => value)))
      expect(result.status).toBe('SUCCESS')
      expect(result.output).toEqual(value)
      expect(result.nodes[0]?.output).toEqual(value)
      expect(result.nodes[0]?.outputPorts).toEqual({ result: value, flow: { $runflow: 'flow', payload: value } })
    })

  it('preserves sparse terminal data and explicitly returned null completion', async () => {
    const action = provider(async () => ({ $runflow: 'port-outputs', outputs: { result: 7, status: 200 } }),
      { outputs: [{ id: 'result', type: 'json' }, { id: 'text', type: 'text' }, { id: 'status', type: 'number' }, { id: 'flow', type: 'flow' }] })
    const result = await executeWorkflow(graph(mode), {}, engine(action))
    expect(result.output).toEqual({ result: 7, status: 200 })
    expect(result.nodes[0]?.outputPorts).not.toHaveProperty('text')
    expect(result.nodes[0]?.outputPorts).toHaveProperty('flow')
    for (const flow of [null, false]) {
      const explicit = await executeWorkflow(graph(mode), {}, engine(provider(async () => ({ $runflow: 'port-outputs', outputs: { result: 7, flow } }))))
      expect(explicit.output).toEqual({ result: 7, flow })
      expect(explicit.nodes[0]?.outputPorts?.flow).toBe(flow)
    }
  })

  it('activates a completion edge once after success and never after rejection', async () => {
    let calls = 0
    const sink = provider(async ({ input }) => { calls++; return input }, { type: 'sink', outputs: [{ id: 'output', type: 'json' }] })
    delete (sink as WorkflowNodeDefinition & { completionPort?: string }).completionPort
    const definition = graph(mode, [{ from: 'action', sourcePort: 'flow', to: 'sink' }])
    const result = await executeWorkflow(definition, {}, engine(provider(async () => 7), sink))
    expect(result.status).toBe('SUCCESS')
    expect(calls).toBe(1)
    const failed = await executeWorkflow(definition, {}, engine(provider(async () => { throw new Error('request failed') }), sink))
    expect(failed.status).toBe('FAILED')
    expect(failed.nodes[0]?.outputPorts).toBeUndefined()
    expect(calls).toBe(1)
  })
})

describe('completion control authority', () => {
  it.each([
    { $runflow: 'control', outputs: { result: 7 }, routes: [] },
    { $runflow: 'control', outputs: { result: 7 }, halt: true },
    { $runflow: 'control', interrupt: 'approval' },
  ] satisfies NodeControlEnvelope[])('does not synthesize unauthorized continuation for %j', async value => {
    const result = await executeWorkflow(graph('state-graph'), {}, engine(provider(async () => structuredClone(value))))
    expect(result.nodes[0]?.outputPorts).not.toHaveProperty('flow')
  })

  it('keeps the original terminal projection across checkpoint resume', async () => {
    const definition: WorkflowDefinition = { id: 'resume', name: 'Resume', version: 1,
      execution: { mode: 'state-graph', entryNodeIds: ['action', 'pause'] },
      nodes: [{ id: 'action', type: 'action', config: {} }, { id: 'pause', type: 'pause', config: {} }], edges: [] }
    const action = provider(async () => ({ stored: true }))
    const pause = provider(async ({ resume }) => resume === undefined ? { $runflow: 'control', interrupt: 'continue' } : 'done',
      { type: 'pause', outputs: [{ id: 'output', type: 'text' }] })
    delete (pause as WorkflowNodeDefinition & { completionPort?: string }).completionPort
    const options = { maxParallelNodes: 2, defaultTimeoutMs: 1000, resolveNode: (type: string) => type === 'action' ? action : pause }
    const paused = await executeWorkflow(definition, {}, options)
    expect(paused.status).toBe('PAUSED')
    const resumed = await executeWorkflow(definition, { checkpoint: JSON.parse(JSON.stringify(paused.checkpoint)), resumeValues: { pause: true } }, options)
    expect(resumed.status).toBe('SUCCESS')
    expect(resumed.output).toEqual({ action: { stored: true }, pause: 'done' })
  })

  it('rejects invalid completion and purity metadata before execution', () => {
    for (const extra of [
      { completionPort: 'missing' }, { completionPort: 'result' }, { executionKind: 'pure' }, { executionKind: 'unknown' },
      { outputs: [{ id: 'flow', type: 'flow' }, { id: 'flow', type: 'json' }] },
    ]) {
      const action = provider(async () => true, extra as Partial<WorkflowNodeDefinition>)
      expect(validateWorkflow(graph('dag'), () => action)).toContainEqual(expect.objectContaining({ code: 'INVALID_EXECUTION' }))
    }
  })
})

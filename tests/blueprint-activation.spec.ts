import { describe, expect, it } from 'vitest'
import type { JsonValue, WorkflowDefinition, WorkflowGraphCheckpoint, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import { isExecutionDocument, isWorkflowDocument } from '../src/backend/v2/document-validation.ts'

const provider = (type: string, execute: WorkflowNodeDefinition['execute'], extra: Partial<WorkflowNodeDefinition> = {}): WorkflowNodeDefinition => ({
  type, title: type, description: type, category: 'action', color: '#123456', icon: 'test',
  inputs: [{ id: 'input', type: 'flow' }], outputs: [{ id: 'output', type: 'flow' }], execute, ...extra,
})
const runtime = (providers: WorkflowNodeDefinition[]) => ({ maxParallelNodes: 4, defaultTimeoutMs: 1000,
  resolveNode: (type: string) => providers.find(item => item.type === type) })
function graph(mode: 'dag' | 'state-graph', nodes: string[], edges: WorkflowDefinition['edges'], entries = [nodes[0]!]): WorkflowDefinition {
  return { id: 'blueprint', name: 'Blueprint', version: 1, nodes: nodes.map(id => ({ id, type: id, config: {} })), edges,
    execution: { mode, semantics: 'blueprint', entryNodeIds: entries, maxSteps: 20 } } as WorkflowDefinition
}

describe.each(['dag', 'state-graph'] as const)('%s Blueprint activations', mode => {
  it('runs every arriving flow independently with scalar inputs, including simultaneous calls', async () => {
    const inputs: JsonValue[] = []
    const providers = [provider('one', async () => 'one'), provider('two', async () => 'two'),
      provider('shared', async ({ input }) => { inputs.push(input); return input }, { inputs: [{ id: 'input', type: 'flow', multiple: true }] })]
    const definition = graph(mode, ['one', 'two', 'shared'], [{ from: 'one', to: 'shared' }, { from: 'two', to: 'shared' }], ['one', 'two'])
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(inputs).toEqual(['one', 'two'])
    const visits = result.steps?.flatMap(step => step.nodes.filter(node => node.nodeId === 'shared')) ?? []
    expect(visits.map(record => record.iteration)).toEqual([1, 2])
    expect(new Set(visits.map(record => record.step)).size).toBe(2)
  })

  it('allows several scalar flow connections but rejects several scalar data connections', () => {
    const providers = [provider('one', async () => 1), provider('two', async () => 2), provider('shared', async ({ input }) => input)]
    const definition = graph(mode, ['one', 'two', 'shared'], [{ from: 'one', to: 'shared' }, { from: 'two', to: 'shared' }], ['one', 'two'])
    expect(validateWorkflow(definition, runtime(providers).resolveNode)).toEqual([])
    const data = providers.map(item => ({ ...item, inputs: [{ id: 'input', type: 'json' as const }], outputs: [{ id: 'output', type: 'json' as const }] }))
    expect(validateWorkflow(definition, runtime(data).resolveNode)).toContainEqual(expect.objectContaining({ code: 'PORT_CARDINALITY' }))
  })

  it('does not wait for an unselected trigger or its inactive branch', async () => {
    const calls: string[] = []
    const providers = ['one', 'two', 'middle', 'shared'].map(id => provider(id, async ({ input }) => { calls.push(id); return id === 'one' ? 'active' : input }))
    const definition = graph(mode, ['one', 'two', 'middle', 'shared'], [
      { from: 'one', to: 'shared' }, { from: 'two', to: 'middle' }, { from: 'middle', to: 'shared' },
    ], ['one', 'two'])
    expect(validateWorkflow(definition, runtime(providers).resolveNode)).toEqual([])
    const result = await executeWorkflow(definition, { entryNodeIds: ['one'] }, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(calls).toEqual(['one', 'shared'])
    expect(result.output).toBe('active')
  })

  it('uses data from the activated predecessor without executing a data-only consumer', async () => {
    const observed: JsonValue[] = []
    let dataEffect = 0
    const providers = [provider('source', async () => ({ $runflow: 'port-outputs', outputs: { flow: 'continue', data: { version: 7 } } }),
      { outputs: [{ id: 'flow', type: 'flow' }, { id: 'data', type: 'json' }] }),
    provider('active', async ({ input, inputs }) => { observed.push({ input, payload: inputs.payload! }); return inputs.payload! },
      { inputs: [{ id: 'input', type: 'flow' }, { id: 'payload', type: 'json' }] }),
    provider('passive', async () => { dataEffect++; return true }, { inputs: [{ id: 'input', type: 'json' }] })]
    const definition = graph(mode, ['source', 'active', 'passive'], [
      { from: 'source', sourcePort: 'flow', to: 'active' },
      { from: 'source', sourcePort: 'data', to: 'active', targetPort: 'payload' },
      { from: 'source', sourcePort: 'data', to: 'passive' },
    ])
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(observed).toEqual([{ input: { version: 7 }, payload: { version: 7 } }])
    expect(dataEffect).toBe(0)
    expect(result.nodes.find(node => node.nodeId === 'passive')?.status).toBe('SKIPPED')
  })

  it('makes multiple data ports the ordinary input map while retaining the scalar flow in named inputs', async () => {
    const definition = graph(mode, ['source', 'sink'], [
      { from: 'source', sourcePort: 'flow', to: 'sink' },
      { from: 'source', sourcePort: 'left', to: 'sink', targetPort: 'left' },
      { from: 'source', sourcePort: 'right', to: 'sink', targetPort: 'right' },
    ])
    const result = await executeWorkflow(definition, {}, runtime([
      provider('source', async () => ({ $runflow: 'port-outputs', outputs: { flow: 'continue', left: 2, right: 3 } }),
        { outputs: [{ id: 'flow', type: 'flow' }, { id: 'left', type: 'number' }, { id: 'right', type: 'number' }] }),
      provider('sink', async ({ input, inputs }) => ({ input, flow: inputs.input! }),
        { inputs: [{ id: 'input', type: 'flow' }, { id: 'left', type: 'number' }, { id: 'right', type: 'number' }] }),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ input: { left: 2, right: 3 }, flow: 'continue' })
  })

  it('keeps the existing execution mode behavior when Blueprint is absent', async () => {
    const values: JsonValue[] = []
    const providers = [provider('one', async () => 'one'), provider('two', async () => 'two'),
      provider('shared', async ({ input }) => { values.push(input); return input }, { inputs: [{ id: 'input', type: 'flow', multiple: true }] })]
    const definition = graph(mode, ['one', 'two', 'shared'], [{ from: 'one', to: 'shared' }, { from: 'two', to: 'shared' }], ['one', 'two'])
    definition.execution = { mode, entryNodeIds: ['one', 'two'] }
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(values).toEqual([['one', 'two']])
  })
})

describe('Blueprint execution validation', () => {
  it('continues rejecting DAG cycles before provider effects', () => {
    const definition = graph('dag', ['one', 'two'], [{ from: 'one', to: 'two' }, { from: 'two', to: 'one' }])
    expect(validateWorkflow(definition)).toContainEqual(expect.objectContaining({ code: 'CYCLE' }))
  })

  it('rejects unknown semantics in execution and persisted definitions', () => {
    const definition = graph('dag', ['one'], [])
    const malformed = { ...definition, execution: { mode: 'dag', semantics: 'unknown' } }
    expect(isWorkflowDocument(definition)).toBe(true)
    expect(isWorkflowDocument(malformed)).toBe(false)
    expect(validateWorkflow(malformed as WorkflowDefinition)).toContainEqual(expect.objectContaining({ code: 'INVALID_EXECUTION' }))
  })
})

describe('Blueprint calls, Join, and checkpoints', () => {
  it('joins uneven sibling paths using an explicit all-channel barrier', async () => {
    const inputs: JsonValue[] = []
    const definition = graph('state-graph', ['start', 'left', 'right', 'tail', 'join'], [
      { from: 'start', to: 'left' }, { from: 'start', to: 'right' }, { from: 'left', to: 'join' },
      { from: 'right', to: 'tail' }, { from: 'tail', to: 'join' },
    ])
    const result = await executeWorkflow(definition, {}, runtime([
      ...['start', 'left', 'right', 'tail'].map(id => provider(id, async () => id)),
      provider('join', async ({ input }) => { inputs.push(input); return input },
        { activation: 'all', inputs: [{ id: 'input', type: 'flow', multiple: true }] }),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(inputs).toEqual([['left', 'tail']])
  })

  it('does not merge independent trigger invocations to satisfy a Join', async () => {
    let calls = 0
    const definition = graph('state-graph', ['one', 'two', 'join'], [{ from: 'one', to: 'join' }, { from: 'two', to: 'join' }], ['one', 'two'])
    const result = await executeWorkflow(definition, {}, runtime([
      provider('one', async () => 1), provider('two', async () => 2), provider('join', async () => { calls++; return true },
        { activation: 'all', inputs: [{ id: 'input', type: 'flow', multiple: true }] }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/join.*inactive/i)
    expect(calls).toBe(0)
  })

  it('refuses conflicting values from repeated shared-node visits at a Join', async () => {
    const definition = graph('state-graph', ['start', 'left', 'right', 'shared', 'left-tail', 'right-tail', 'join'], [
      { from: 'start', to: 'left' }, { from: 'start', to: 'right' }, { from: 'left', to: 'shared' }, { from: 'right', to: 'shared' },
      { from: 'shared', sourcePort: 'left', to: 'left-tail' }, { from: 'shared', sourcePort: 'right', to: 'right-tail' },
      { from: 'left-tail', to: 'join' }, { from: 'right-tail', to: 'join' },
    ])
    const result = await executeWorkflow(definition, {}, runtime([
      ...['start', 'left', 'right', 'left-tail', 'right-tail'].map(id => provider(id, async () => id)),
      provider('shared', async ({ input }) => ({ $runflow: 'port-outputs', outputs: { [String(input)]: input } }),
        { outputs: [{ id: 'left', type: 'flow' }, { id: 'right', type: 'flow' }] }),
      provider('join', async () => true, { activation: 'all', inputs: [{ id: 'input', type: 'flow', multiple: true }] }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/conflicting data.*shared/)
  })

  it('fails a connected data input missing from this call instead of reading another call or invoking its source', async () => {
    let otherEffect = 0
    const definition = graph('dag', ['one', 'other', 'sink'], [
      { from: 'one', to: 'sink' }, { from: 'other', sourcePort: 'data', to: 'sink', targetPort: 'data' },
    ], ['one', 'other'])
    const result = await executeWorkflow(definition, { entryNodeIds: ['one'] }, runtime([
      provider('one', async () => 'flow'),
      provider('other', async () => { otherEffect++; return { $runflow: 'port-outputs', outputs: { data: 'forbidden' } } }, { outputs: [{ id: 'data', type: 'text' }] }),
      provider('sink', async () => true, { inputs: [{ id: 'input', type: 'flow' }, { id: 'data', type: 'text' }] }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/Data input sink.data.*unavailable/)
    expect(otherEffect).toBe(0)
    expect(result.nodes.find(node => node.nodeId === 'sink')?.status).toBe('FAILED')
  })

  it('never reads another trigger call data even when that effect has already finished', async () => {
    let otherEffect = 0
    const definition = graph('dag', ['one', 'other', 'sink'], [
      { from: 'one', to: 'sink' }, { from: 'other', sourcePort: 'data', to: 'sink', targetPort: 'data' },
    ], ['one', 'other'])
    const result = await executeWorkflow(definition, {}, runtime([
      provider('one', async () => 'flow'),
      provider('other', async () => { otherEffect++; return 'different call' }, { outputs: [{ id: 'data', type: 'text' }] }),
      provider('sink', async () => true, { inputs: [{ id: 'input', type: 'flow' }, { id: 'data', type: 'text' }] }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/unavailable in this Blueprint call/)
    expect(otherEffect).toBe(1)
  })

  it('keeps previous effect values local while another call revisits the same provider', async () => {
    const values: JsonValue[] = []
    const definition = graph('dag', ['one', 'two', 'shared', 'tail', 'sink'], [
      { from: 'one', to: 'shared' }, { from: 'two', to: 'shared' }, { from: 'shared', sourcePort: 'flow', to: 'tail' },
      { from: 'tail', to: 'sink' }, { from: 'shared', sourcePort: 'data', to: 'sink', targetPort: 'data' },
    ], ['one', 'two'])
    const result = await executeWorkflow(definition, {}, runtime([
      provider('one', async () => 'one'), provider('two', async () => 'two'),
      provider('shared', async ({ input }) => ({ $runflow: 'port-outputs', outputs: { flow: input, data: input } }),
        { outputs: [{ id: 'flow', type: 'flow' }, { id: 'data', type: 'text' }] }),
      provider('tail', async ({ input }) => input),
      provider('sink', async ({ inputs }) => { values.push(inputs.data!); return inputs.data! },
        { inputs: [{ id: 'input', type: 'flow' }, { id: 'data', type: 'text' }] }),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(values).toEqual(['one', 'two'])
    const firstSource = result.steps!.flatMap(step => step.nodes).find(node => node.nodeId === 'shared')!
    const firstSink = result.steps!.flatMap(step => step.nodes).find(node => node.nodeId === 'sink')!
    expect(firstSource.callId).toBe(firstSink.callId)
    expect(firstSource.callId).toBeTruthy()
  })

  it('resumes the interrupted call before queued calls and never reuses its answer for the next call', async () => {
    const completed: JsonValue[] = []
    const definition = graph('dag', ['one', 'two', 'approval'], [{ from: 'one', to: 'approval' }, { from: 'two', to: 'approval' }], ['one', 'two'])
    const providers = [provider('one', async () => 'one'), provider('two', async () => 'two'),
      provider('approval', async ({ input, resume }) => {
        if (resume === undefined) return { $runflow: 'control', interrupt: input }
        const value = { input, answer: resume.value }; completed.push(value)
        return { $runflow: 'control', outputs: { output: value } }
      })]
    const paused = await executeWorkflow(definition, {}, runtime(providers))
    expect(paused.status).toBe('PAUSED')
    expect(paused.checkpoint?.pending.map(activation => activation.value)).toEqual(['one', 'two'])
    expect(paused.checkpoint?.semantics).toBe('blueprint')
    expect(paused.checkpoint?.pending[0]?.call?.id).not.toBe(paused.checkpoint?.pending[1]?.call?.id)
    expect(isExecutionDocument(JSON.parse(JSON.stringify(paused)))).toBe(true)
    const second = await executeWorkflow(definition, { checkpoint: JSON.parse(JSON.stringify(paused.checkpoint)), resumeValues: { approval: 'first-answer' } }, runtime(providers))
    expect(second.status).toBe('PAUSED')
    expect(second.checkpoint?.interrupts).toEqual({ approval: 'two' })
    expect(completed).toEqual([{ input: 'one', answer: 'first-answer' }])
    const finished = await executeWorkflow(definition, { checkpoint: second.checkpoint!, resumeValues: { approval: 'second-answer' } }, runtime(providers))
    expect(finished.status).toBe('SUCCESS')
    expect(completed).toEqual([{ input: 'one', answer: 'first-answer' }, { input: 'two', answer: 'second-answer' }])
  })

  it('rejects missing or forged call scope metadata before resuming provider work', async () => {
    const definition = graph('dag', ['pause'], [])
    const providers = [provider('pause', async () => ({ $runflow: 'control', interrupt: true }))]
    const paused = await executeWorkflow(definition, {}, runtime(providers))
    expect(paused.status).toBe('PAUSED')
    for (const mutate of [
      (checkpoint: WorkflowGraphCheckpoint) => { delete checkpoint.semantics },
      (checkpoint: WorkflowGraphCheckpoint) => { delete checkpoint.pending[0]!.call },
      (checkpoint: WorkflowGraphCheckpoint) => { checkpoint.pending[0]!.call!.id = '' },
      (checkpoint: WorkflowGraphCheckpoint) => { checkpoint.pending[0]!.call!.outputs = { unknown: {} } },
      (checkpoint: WorkflowGraphCheckpoint) => { checkpoint.pending[0]!.call!.outputs = { pause: { unknownPort: true } } },
    ]) {
      const checkpoint = structuredClone(paused.checkpoint!)
      mutate(checkpoint)
      await expect(executeWorkflow(definition, { checkpoint, resumeValues: { pause: true } }, runtime(providers))).rejects.toThrow(/checkpoint/i)
    }
  })

  it('honors limits and pre-cancellation without bypassing the Blueprint scheduler', async () => {
    let called = 0
    const definition = graph('state-graph', ['loop'], [{ from: 'loop', to: 'loop' }])
    definition.execution!.maxSteps = 3
    const providers = [provider('loop', async () => { called++; return true })]
    const cancelled = await executeWorkflow(definition, { signal: AbortSignal.abort('cancel-before-start') }, runtime(providers))
    expect(cancelled.status).toBe('CANCELLED')
    expect(called).toBe(0)
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/step limit/)
    expect(called).toBe(3)
    expect(result.step).toBe(3)
  })

  it('stops queued calls when cancellation arrives during the first shared invocation', async () => {
    const controller = new AbortController()
    const values: JsonValue[] = []
    const definition = graph('dag', ['one', 'two', 'shared'], [{ from: 'one', to: 'shared' }, { from: 'two', to: 'shared' }], ['one', 'two'])
    const result = await executeWorkflow(definition, { signal: controller.signal }, runtime([
      provider('one', async () => 'one'), provider('two', async () => 'two'),
      provider('shared', async ({ input }) => { values.push(input); controller.abort('stop queued calls'); return input }),
    ]))
    expect(result.status).toBe('CANCELLED')
    expect(values).toEqual(['one'])
  })
})

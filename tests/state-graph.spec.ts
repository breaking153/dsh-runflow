import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowGraphCheckpoint, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'

const provider = (type: string, execute: WorkflowNodeDefinition['execute'], extra: Partial<WorkflowNodeDefinition> = {}): WorkflowNodeDefinition => ({
  type, title: type, description: type, category: 'logic', color: '#fff', icon: 'test',
  inputs: [{ id: 'input', type: 'any', multiple: true }], outputs: [{ id: 'output', type: 'any' }], execute, ...extra,
})
function graph(nodes: string[], edges: WorkflowDefinition['edges'], config: Partial<NonNullable<WorkflowDefinition['execution']>> = {}): WorkflowDefinition {
  return { id: 'state-test', name: 'State test', version: 1, nodes: nodes.map(id => ({ id, type: id, config: {} })), edges,
    execution: { mode: 'state-graph', entryNodeIds: [nodes[0]!], maxSteps: 20, ...config } }
}
function engine(providers: WorkflowNodeDefinition[], parallel = 4) {
  return { maxParallelNodes: parallel, defaultTimeoutMs: 1_000, resolveNode: (type: string) => providers.find(node => node.type === type) }
}

describe('state graph execution', () => {
  it('runs bounded cycles with state visible only after a committed step', async () => {
    const definition = graph(['counter', 'end'], [{ from: 'counter', sourcePort: 'again', to: 'counter' }, { from: 'counter', sourcePort: 'done', to: 'end' }], { initialState: { count: 0 } })
    const result = await executeWorkflow(definition, {}, engine([
      provider('counter', async ({ state }) => {
        const count = Number(state?.count) + 1
        return { $runflow: 'control', update: { count }, outputs: { again: count, done: count }, routes: [count < 3 ? 'again' : 'done'] }
      }, { outputs: [{ id: 'again', type: 'any' }, { id: 'done', type: 'any' }] }),
      provider('end', async ({ state }) => state?.count ?? null),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(result.state).toEqual({ count: 3 })
    expect(result.output).toBe(3)
    expect(result.steps?.flatMap(step => step.nodes).filter(node => node.nodeId === 'counter')).toHaveLength(3)
  })

  it('commits parallel reducers deterministically and isolates same-step readers', async () => {
    const observations: unknown[] = []
    const result = await executeWorkflow(graph(['first', 'second'], [], { entryNodeIds: ['first', 'second'], initialState: { names: [], total: 0 }, reducers: { names: 'append', total: 'sum' } }), {}, engine([
      provider('first', async ({ state }) => { await new Promise(resolve => setTimeout(resolve, 10)); observations.push(state?.total); return { $runflow: 'control', update: { names: ['first'], total: 2 } } }),
      provider('second', async ({ state }) => { observations.push(state?.total); return { $runflow: 'control', update: { names: ['second'], total: 3 } } }),
    ]))
    expect(result.state).toEqual({ names: ['first', 'second'], total: 5 })
    expect(observations).toEqual([0, 0])
  })

  it('continues a normal edge when a control node only updates state', async () => {
    const result = await executeWorkflow(graph(['write', 'read'], [{ from: 'write', to: 'read' }]), {}, engine([
      provider('write', async () => ({ $runflow: 'control', update: { ready: true } })),
      provider('read', async ({ state }) => state?.ready ?? false),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toBe(true)
  })

  it('rejects concurrent replacement writes without partially committing state', async () => {
    const result = await executeWorkflow(graph(['a', 'b'], [], { entryNodeIds: ['a', 'b'], initialState: { answer: 0 } }), {}, engine([
      provider('a', async () => ({ $runflow: 'control', update: { answer: 1 } })),
      provider('b', async () => ({ $runflow: 'control', update: { answer: 2 } })),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('concurrent')
    expect(result.state).toEqual({ answer: 0 })
  })

  it('does not activate an omitted output or its downstream descendants', async () => {
    const called: string[] = []
    const result = await executeWorkflow(graph(['route', 'yes', 'no', 'descendant'], [
      { from: 'route', sourcePort: 'yes', to: 'yes' }, { from: 'route', sourcePort: 'no', to: 'no' }, { from: 'no', to: 'descendant' },
    ]), {}, engine([
      provider('route', async () => ({ $runflow: 'port-outputs', outputs: { yes: null } }), { outputs: [{ id: 'yes', type: 'any' }, { id: 'no', type: 'any' }] }),
      ...['yes', 'no', 'descendant'].map(id => provider(id, async () => { called.push(id); return id })),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(called).toEqual(['yes'])
    expect(result.nodes.find(node => node.nodeId === 'descendant')?.status).toBe('SKIPPED')
  })

  it('joins uneven parallel branches once after all incoming messages arrive', async () => {
    const joined: unknown[] = []
    const result = await executeWorkflow(graph(['start', 'left', 'right', 'tail', 'join'], [
      { from: 'start', to: 'left' }, { from: 'start', to: 'right' }, { from: 'left', to: 'join' },
      { from: 'right', to: 'tail' }, { from: 'tail', to: 'join' },
    ]), {}, engine([
      ...['start', 'left', 'right', 'tail'].map(id => provider(id, async () => id)),
      provider('join', async ({ input }) => { joined.push(input); return input }, { activation: 'all' }),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(joined).toEqual([['left', 'tail']])
  })

  it('reports an unsatisfied all-input join instead of silent success', async () => {
    const result = await executeWorkflow(graph(['start', 'a', 'b', 'join'], [
      { from: 'start', sourcePort: 'a', to: 'a' }, { from: 'start', sourcePort: 'b', to: 'b' },
      { from: 'a', to: 'join' }, { from: 'b', to: 'join' },
    ]), {}, engine([
      provider('start', async () => ({ $runflow: 'port-outputs', outputs: { a: 1 } }), { outputs: [{ id: 'a', type: 'any' }, { id: 'b', type: 'any' }] }),
      provider('a', async ({ input }) => input), provider('b', async ({ input }) => input), provider('join', async ({ input }) => input, { activation: 'all' }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('join')
  })

  it('fails runaway loops at the configured step limit', async () => {
    const result = await executeWorkflow(graph(['loop'], [{ from: 'loop', to: 'loop' }], { maxSteps: 3 }), {}, engine([provider('loop', async () => 1)]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('step limit')
    expect(result.step).toBe(3)
  })

  it('pauses and resumes a checkpoint without replaying completed side branches', async () => {
    let sideCalls = 0
    const checkpoints: WorkflowGraphCheckpoint[] = []
    const definition = graph(['side', 'approval', 'end'], [{ from: 'approval', to: 'end' }], { entryNodeIds: ['side', 'approval'] })
    const runtime = engine([
      provider('side', async () => { sideCalls += 1; return 'side-effect' }),
      provider('approval', async ({ resume }) => resume === undefined ? { $runflow: 'control', interrupt: { question: 'Continue?' } } : { $runflow: 'control', update: { approved: resume.value }, outputs: { output: resume.value } }),
      provider('end', async ({ state }) => state?.approved ?? null),
    ])
    const paused = await executeWorkflow(definition, {}, { ...runtime, onCheckpoint(checkpoint) { checkpoints.push(structuredClone(checkpoint)) } })
    expect(paused.status).toBe('PAUSED')
    expect(paused.checkpoint?.interrupts).toEqual({ approval: { question: 'Continue?' } })
    const result = await executeWorkflow(definition, { checkpoint: paused.checkpoint!, resumeValues: { approval: true } }, runtime)
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ side: 'side-effect', end: true })
    expect(sideCalls).toBe(1)
    expect(checkpoints).toHaveLength(1)
    expect(result.id).toBe(paused.id)
  })

  it('rejects a checkpoint from another workflow revision', async () => {
    const definition = graph(['pause'], [])
    const runtime = engine([provider('pause', async () => ({ $runflow: 'control', interrupt: 'Approval' }))])
    const paused = await executeWorkflow(definition, {}, runtime)
    await expect(executeWorkflow({ ...definition, version: 2 }, { checkpoint: paused.checkpoint! }, runtime)).rejects.toThrow('checkpoint')
  })

  it('waits for checkpoint persistence before starting the next step', async () => {
    let downstream = false
    const result = await executeWorkflow(graph(['first', 'second'], [{ from: 'first', to: 'second' }]), {}, {
      ...engine([provider('first', async () => 1), provider('second', async () => { downstream = true; return 2 })]),
      onCheckpoint() { throw new Error('disk full') },
    })
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('disk full')
    expect(downstream).toBe(false)
  })

  it('honors pre-cancellation without executing providers', async () => {
    let called = false
    const result = await executeWorkflow(graph(['start'], []), { signal: AbortSignal.abort('stop') }, engine([provider('start', async () => { called = true; return 1 })]))
    expect(result.status).toBe('CANCELLED')
    expect(called).toBe(false)
  })

  it('exposes the real provider task so Host disposal can drain late cancellation cleanup', async () => {
    let begin!: () => void
    let release!: () => void
    let cleaned = false
    const started = new Promise<void>(resolve => { begin = resolve })
    const cleanup = new Promise<void>(resolve => { release = resolve })
    const tasks: Promise<unknown>[] = []
    const controller = new AbortController()
    const running = executeWorkflow(graph(['slow'], []), { signal: controller.signal }, {
      ...engine([provider('slow', async ({ signal }) => {
        begin()
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
        await cleanup
        cleaned = true
        return 'cleaned'
      })]),
      onNodeTask(task) { tasks.push(task) },
    })
    await started
    controller.abort('dispose')
    const result = await running
    expect(result.status).toBe('CANCELLED')
    expect(cleaned).toBe(false)
    expect(tasks).toHaveLength(1)
    release()
    await Promise.allSettled(tasks)
    expect(cleaned).toBe(true)
  })

  it('resolves a repeated provider type once for one coherent run', async () => {
    let resolutions = 0
    const definition = graph(['first', 'second'], [{ from: 'first', to: 'second' }])
    definition.nodes.forEach(node => { node.type = 'shared' })
    const result = await executeWorkflow(definition, {}, {
      maxParallelNodes: 2, defaultTimeoutMs: 500,
      resolveNode: () => { resolutions += 1; const generation = resolutions; return provider('shared', async () => generation) },
    })
    expect(result.output).toBe(1)
    expect(resolutions).toBe(1)
  })

  it('rejects simultaneous single-port inputs instead of silently losing one', async () => {
    const result = await executeWorkflow(graph(['a', 'b', 'sink'], [{ from: 'a', to: 'sink' }, { from: 'b', to: 'sink' }], { entryNodeIds: ['a', 'b'] }), {}, engine([
      provider('a', async () => 'a'), provider('b', async () => 'b'),
      provider('sink', async ({ input }) => input, { inputs: [{ id: 'input', type: 'any' }] }),
    ]))
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('multiple messages')
  })

  it('does not mutate an object prototype while merging reducer writes', async () => {
    const result = await executeWorkflow(graph(['write'], [], { initialState: { metadata: {} }, reducers: { metadata: 'merge' } }), {}, engine([
      provider('write', async () => ({ $runflow: 'control', update: { metadata: JSON.parse('{"__proto__":{"injected":true},"safe":1}') } })),
    ]))
    expect(result.state?.metadata).toEqual(JSON.parse('{"__proto__":{"injected":true},"safe":1}'))
    expect(Object.getPrototypeOf(result.state?.metadata)).toBe(Object.prototype)
  })

  it('treats inherited object property names as ordinary node and state keys', async () => {
    const result = await executeWorkflow(graph(['toString'], [], { reducers: {} }), {}, engine([
      provider('toString', async () => ({ $runflow: 'control', update: { toString: 'ordinary data' }, outputs: { output: 1 } })),
    ]))
    expect(result.status).toBe('SUCCESS')
    expect(result.state).toEqual({ toString: 'ordinary data' })
    expect(result.nodes[0]?.iteration).toBe(1)
  })

  it('does not resume any paused nodes until all simultaneous answers exist', async () => {
    let resumedCalls = 0
    const definition = graph(['a', 'b'], [], { entryNodeIds: ['a', 'b'] })
    const runtime = engine(['a', 'b'].map(id => provider(id, async ({ resume }) => {
      if (resume === undefined) return { $runflow: 'control', interrupt: id }
      resumedCalls += 1; return resume.value
    })))
    const paused = await executeWorkflow(definition, {}, runtime)
    const stillPaused = await executeWorkflow(definition, { checkpoint: paused.checkpoint!, resumeValues: { a: true } }, runtime)
    expect(stillPaused.status).toBe('PAUSED')
    expect(resumedCalls).toBe(0)
    expect(stillPaused.startedAt).toBe(paused.startedAt)
    const resumed = await executeWorkflow(definition, { checkpoint: stillPaused.checkpoint!, resumeValues: { a: true, b: false } }, runtime)
    expect(resumed.status).toBe('SUCCESS')
    expect(resumedCalls).toBe(2)
  })

  it('retains the legacy DAG cycle validation and validates state graph entries', () => {
    const definition = graph(['a'], [{ from: 'a', to: 'a' }])
    expect(validateWorkflow(definition)).toEqual([])
    const { execution: _config, ...legacy } = definition
    expect(validateWorkflow(legacy)).toContainEqual(expect.objectContaining({ code: 'SELF_EDGE' }))
    expect(validateWorkflow({ ...definition, execution: { mode: 'state-graph', entryNodeIds: ['missing'] } })).toContainEqual(expect.objectContaining({ code: 'INVALID_EXECUTION' }))
  })
})

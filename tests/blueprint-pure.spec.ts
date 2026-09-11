import { describe, expect, it } from 'vitest'
import type { JsonValue, WorkflowDefinition, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow } from '../src/engine.ts'
import { isExecutionDocument } from '../src/backend/v2/document-validation.ts'

const node = (type: string, execute: WorkflowNodeDefinition['execute'], extra: Partial<WorkflowNodeDefinition> = {}): WorkflowNodeDefinition => ({
  type, title: type, description: type, category: 'data', color: '#123456', icon: 'test', executionKind: 'pure',
  inputs: [{ id: 'input', type: 'json' }], outputs: [{ id: 'output', type: 'json' }], execute, ...extra,
})
const trigger = (type = 'trigger', value: JsonValue = 'start'): WorkflowNodeDefinition => node(type, async () => value,
  { category: 'trigger', executionKind: 'trigger', inputs: [], outputs: [{ id: 'flow', type: 'flow' }] })
const effect = (type: string, execute: WorkflowNodeDefinition['execute'], extra: Partial<WorkflowNodeDefinition> = {}): WorkflowNodeDefinition => node(type, execute,
  { executionKind: 'effect', inputs: [{ id: 'flow', type: 'flow' }, { id: 'data', type: 'json' }], outputs: [{ id: 'output', type: 'json' }, { id: 'flow', type: 'flow' }], completionPort: 'flow', ...extra })
const runtime = (providers: WorkflowNodeDefinition[]) => ({ maxParallelNodes: 4, defaultTimeoutMs: 1000, resolveNode: (id: string) => providers.find(provider => provider.type === id) })
const graph = (providers: WorkflowNodeDefinition[], edges: WorkflowDefinition['edges'], mode: 'dag' | 'state-graph' = 'state-graph'): WorkflowDefinition => ({
  id: 'pure', name: 'Pure', version: 1, nodes: providers.map(provider => ({ id: provider.type, type: provider.type, config: {} })), edges,
  execution: { mode, semantics: 'blueprint', maxSteps: 20 },
})
const flow = (from: string, to: string): WorkflowDefinition['edges'][number] => ({ from, sourcePort: 'flow', to, targetPort: 'flow' })
const data = (from: string, to: string, targetPort = 'data'): WorkflowDefinition['edges'][number] => ({ from, sourcePort: 'output', to, targetPort })

describe.each(['dag', 'state-graph'] as const)('%s Blueprint pure demand', mode => {
  it('recursively evaluates arguments and shared dependencies once within each consumer invocation', async () => {
    let reads = 0
    const providers = [trigger(), node('read', async () => { reads++; return 3 }, { inputs: [] }),
      node('left', async ({ input }) => Number(input) + 1), node('right', async ({ input }) => Number(input) + 2),
      effect('sink', async ({ input }) => input, { inputs: [{ id: 'flow', type: 'flow' }, { id: 'left', type: 'number' }, { id: 'right', type: 'number' }] })]
    const definition = graph(providers, [flow('trigger', 'sink'), data('read', 'left', 'input'), data('read', 'right', 'input'), data('left', 'sink', 'left'), data('right', 'sink', 'right')], mode)
    // Numeric outputs preserve meaningful connection type validation.
    for (const item of providers.filter(item => ['left', 'right'].includes(item.type))) item.outputs = [{ id: 'output', type: 'number' }]
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ left: 4, right: 5 })
    expect(reads).toBe(1)
    const visits = result.steps!.flatMap(step => step.nodes).filter(record => record.evaluatedFor !== undefined)
    expect(visits.map(record => record.nodeId).sort()).toEqual(['left', 'read', 'right'])
    expect(visits.every(record => record.evaluatedFor === 'sink' && record.callId === result.nodes.find(record => record.nodeId === 'sink')?.callId)).toBe(true)
    expect(isExecutionDocument(result)).toBe(true)
  })

  it('does not run an unused pure root alongside a trigger, and permits an explicitly selected pure target', async () => {
    let unused = 0
    const providers = [trigger(), node('base', async () => 5, { inputs: [] }), node('pure', async ({ input }) => Number(input) * 2),
      node('unused', async () => { unused++; return 99 }, { inputs: [] }), effect('sink', async () => 'done')]
    const definition = graph(providers, [flow('trigger', 'sink'), data('base', 'pure', 'input')], mode)
    const ordinary = await executeWorkflow(definition, {}, runtime(providers))
    expect(ordinary.status).toBe('SUCCESS')
    expect(ordinary.output).toBe('done')
    expect(unused).toBe(0)
    expect(ordinary.nodes.find(record => record.nodeId === 'base')?.status).toBe('SKIPPED')
    const selected = await executeWorkflow(definition, { entryNodeIds: ['pure'] }, runtime(providers))
    expect(selected.status).toBe('SUCCESS')
    expect(selected.output).toBe(10)
    expect(unused).toBe(0)
  })

  it('runs a standalone pure chain and an effect whose only incoming arguments are pure', async () => {
    const pure = [node('base', async () => 2, { inputs: [] }), node('double', async ({ input }) => Number(input) * 2)]
    const result = await executeWorkflow(graph(pure, [data('base', 'double', 'input')], mode), {}, runtime(pure))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toBe(4)
    const providers = [...pure, effect('sink', async ({ input }) => input)]
    const output = await executeWorkflow(graph(providers, [data('base', 'double', 'input'), data('double', 'sink')], mode), {}, runtime(providers))
    expect(output.status).toBe('SUCCESS')
    expect(output.output).toBe(4)
  })

  it('does not demand an effect through a pure argument chain', async () => {
    let effects = 0
    const providers = [trigger(), effect('source', async () => { effects++; return 9 }), node('pure', async ({ input }) => input), effect('sink', async ({ input }) => input)]
    const definition = graph(providers, [flow('trigger', 'sink'), data('source', 'pure', 'input'), data('pure', 'sink')], mode)
    definition.execution!.entryNodeIds = ['trigger', 'source']
    const result = await executeWorkflow(definition, { entryNodeIds: ['trigger'] }, runtime(providers))
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('unavailable in this Blueprint call')
    expect(effects).toBe(0)
  })

  it('isolates per-consumer caches and records when two consumers demand the same provider in one step', async () => {
    let reads = 0
    const providers = [trigger(), node('read', async () => ++reads, { inputs: [] }), effect('left', async ({ input }) => input), effect('right', async ({ input }) => input)]
    const result = await executeWorkflow(graph(providers, [flow('trigger', 'left'), flow('trigger', 'right'), data('read', 'left'), data('read', 'right')], mode), {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(reads).toBe(2)
    const visits = result.steps!.flatMap(step => step.nodes).filter(record => record.nodeId === 'read')
    expect(visits.map(record => record.iteration)).toEqual([1, 2])
    expect(visits.map(record => record.evaluatedFor).sort()).toEqual(['left', 'right'])
  })

  it('uses effect data from the same call through a pure chain and promotes falsy values', async () => {
    const providers = [trigger(), effect('source', async () => false), node('pure', async ({ input }) => input),
      effect('sink', async ({ input, inputs, node }) => ({ input, configured: node.config.enabled!, wired: inputs['property-enabled']! }),
        { configSchema: { type: 'object', properties: { enabled: { type: 'boolean' } } } })]
    providers.find(item => item.type === 'pure')!.outputs = [{ id: 'output', type: 'boolean' }]
    const definition = graph(providers, [flow('trigger', 'source'), flow('source', 'sink'), data('source', 'pure', 'input'), data('pure', 'sink', 'property-enabled')], mode)
    const sink = definition.nodes.find(node => node.id === 'sink')!
    sink.config.enabled = true
    sink.promotedInputs = ['enabled']
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ input: { $runflow: 'flow', payload: false }, configured: false, wired: false })
    expect(sink.config.enabled).toBe(true)
  })
})

describe('Blueprint pure demand boundaries', () => {
  it('reads the current state again after each effect visit and after a serialized pause/resume', async () => {
    const observed: JsonValue[] = []
    const providers = [trigger(), node('read', async ({ state }) => state?.count ?? 0, { inputs: [] }),
      effect('increment', async ({ input }) => { observed.push(input); return { $runflow: 'control', outputs: { output: input }, update: { count: Number(input) + 1 } } }),
      effect('pause', async ({ resume }) => resume === undefined ? { $runflow: 'control', interrupt: 'continue' } : { $runflow: 'control', outputs: { output: resume.value } }),
      effect('sink', async ({ input }) => input)]
    const definition = graph(providers, [flow('trigger', 'increment'), data('read', 'increment'), flow('increment', 'pause'), flow('pause', 'sink'), data('read', 'sink')])
    const paused = await executeWorkflow(definition, {}, runtime(providers))
    expect(paused.status).toBe('PAUSED')
    expect(paused.state).toEqual({ count: 1 })
    const resumed = await executeWorkflow(definition, { checkpoint: JSON.parse(JSON.stringify(paused.checkpoint)), resumeValues: { pause: true } }, runtime(providers))
    expect(resumed.status).toBe('SUCCESS')
    expect(resumed.output).toBe(1)
    expect(observed).toEqual([0])
    expect(resumed.steps!.flatMap(step => step.nodes).filter(record => record.nodeId === 'read').map(record => record.output)).toEqual([0, 1])
  })

  it('evaluates state fresh on a control loop, retaining the same flow call', async () => {
    const providers = [trigger(), node('read', async ({ state }) => state?.count ?? 0, { inputs: [] }),
      effect('loop', async ({ input }) => ({ $runflow: 'control', outputs: { output: input }, update: { count: Number(input) + 1 }, ...(Number(input) >= 2 ? { halt: true } : {}) }))]
    const definition = graph(providers, [flow('trigger', 'loop'), flow('loop', 'loop'), data('read', 'loop')])
    const result = await executeWorkflow(definition, {}, runtime(providers))
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toBe(2)
    const visits = result.steps!.flatMap(step => step.nodes).filter(record => record.nodeId === 'read')
    expect(visits.map(record => record.output)).toEqual([0, 1, 2])
    expect(new Set(visits.map(record => record.callId)).size).toBe(1)
  })

  it('rejects a recursive pure cycle before executing the consumer effect', async () => {
    let effects = 0
    const providers = [trigger(), node('left', async ({ input }) => input), node('right', async ({ input }) => input), effect('sink', async () => { effects++; return 1 })]
    const result = await executeWorkflow(graph(providers, [flow('trigger', 'sink'), data('left', 'right', 'input'), data('right', 'left', 'input'), data('left', 'sink')]), {}, runtime(providers))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/pure dependency cycle/i)
    expect(effects).toBe(0)
  })

  it('rejects control envelopes from a declared pure provider without applying state or continuing', async () => {
    const providers = [trigger(), node('pure', async () => ({ $runflow: 'control', update: { invalid: true } }), { inputs: [] }), effect('sink', async ({ input }) => input)]
    const result = await executeWorkflow(graph(providers, [flow('trigger', 'sink'), data('pure', 'sink')]), {}, runtime(providers))
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/pure.*control/i)
    expect(result.state).toEqual({})
    expect(result.nodes.find(record => record.nodeId === 'sink')?.attempts).toBe(0)
  })

  it.each(['timeout', 'cancel'] as const)('stops a demanded pure provider on %s before consumer execution', async reason => {
    const controller = new AbortController()
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const providers = [trigger(), node('slow', async () => { entered(); return new Promise<JsonValue>(() => {}) }, { inputs: [] }), effect('sink', async () => 'forbidden')]
    const definition = graph(providers, [flow('trigger', 'sink'), data('slow', 'sink')])
    definition.nodes.find(node => node.id === 'slow')!.config.timeoutMs = reason === 'timeout' ? 10 : 1000
    const running = executeWorkflow(definition, { signal: controller.signal }, runtime(providers))
    if (reason === 'cancel') { await started; controller.abort('stop') }
    const result = await running
    expect(result.status).toBe(reason === 'timeout' ? 'FAILED' : 'CANCELLED')
    expect(result.nodes.find(record => record.nodeId === 'slow')?.attempts).toBe(1)
    expect(result.nodes.find(record => record.nodeId === 'sink')?.attempts).toBe(0)
  })
})

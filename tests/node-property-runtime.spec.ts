import { describe, expect, it } from 'vitest'
import type { JsonObject, JsonValue, WorkflowDefinition, WorkflowNode, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import { isWorkflowDocument } from '../src/backend/v2/document-validation.ts'

function provider(type: string, extra: Partial<WorkflowNodeDefinition>): WorkflowNodeDefinition {
  return { type, title: type, description: type, category: 'data', color: '#123456', icon: 'test',
    execute: async ({ input }) => input, ...extra }
}

function promoted(config: JsonObject, keys: string[]): WorkflowNode {
  return { id: 'consumer', type: 'consumer', config, promotedInputs: keys } as WorkflowNode
}

function graph(mode: 'dag' | 'state-graph', consumer: WorkflowNode, values: JsonObject): WorkflowDefinition {
  return { id: 'properties', name: 'Properties', version: 1, execution: { mode },
    nodes: [{ id: 'source', type: 'source', config: {} }, consumer],
    edges: Object.keys(values).map(id => ({ from: 'source', to: 'consumer', sourcePort: id, targetPort: id })) }
}

describe.each(['dag', 'state-graph'] as const)('%s property bindings', mode => {
  it('overrides config from typed property inputs without changing the ordinary input or saved defaults', async () => {
    const node = promoted({ label: 'saved', options: { enabled: true, count: 7 }, nullable: 'saved', untouched: 3 },
      ['label', 'options.enabled', 'options.count', 'nullable'])
    const values: JsonObject = { input: { document: 'ordinary' }, 'property-label': '',
      'property-options_2e_enabled': false, 'property-options_2e_count': 0, 'property-nullable': null }
    const source = provider('source', { inputs: [], outputs: [
      { id: 'input', type: 'json' }, { id: 'property-label', type: 'text' },
      { id: 'property-options_2e_enabled', type: 'boolean' }, { id: 'property-options_2e_count', type: 'number' },
      { id: 'property-nullable', type: 'any' },
    ], execute: async () => ({ $runflow: 'port-outputs', outputs: values }) })
    const consumer = provider('consumer', {
      inputs: [{ id: 'input', type: 'json' }], outputs: [{ id: 'output', type: 'json' }],
      configSchema: { type: 'object', properties: { label: { type: 'string' },
        options: { type: 'object', properties: { enabled: { type: 'boolean' }, count: { type: 'integer' } } }, nullable: {} } },
      execute: async ({ input, inputs, node: resolved }) => ({ input, inputs: { ...inputs }, config: resolved.config }),
    })
    const definition = graph(mode, node, values)
    const original = structuredClone(definition)
    const resolveNode = (type: string) => type === 'source' ? source : consumer
    expect(validateWorkflow(definition, resolveNode)).toEqual([])
    const result = await executeWorkflow(definition, {}, { maxParallelNodes: 2, defaultTimeoutMs: 1000, resolveNode })
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ input: { document: 'ordinary' }, inputs: values,
      config: { label: '', options: { enabled: false, count: 0 }, nullable: null, untouched: 3 } })
    expect(result.nodes.find(item => item.nodeId === 'consumer')?.input).toEqual({ document: 'ordinary' })
    expect(definition).toEqual(original)
  })

  it('retains a configured fallback when a promoted input has no connection', async () => {
    const node = promoted({ label: 'fallback' }, ['label'])
    const definition: WorkflowDefinition = { id: 'fallback', name: 'Fallback', version: 1, execution: { mode }, nodes: [node], edges: [] }
    const consumer = provider('consumer', { inputs: [{ id: 'input', type: 'json' }],
      configSchema: { properties: { label: { type: 'string' } } },
      execute: async ({ input, node: resolved }) => ({ input, label: resolved.config.label! }) })
    const result = await executeWorkflow(definition, { input: { original: true } },
      { maxParallelNodes: 1, defaultTimeoutMs: 1000, resolveNode: () => consumer })
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ input: { original: true }, label: 'fallback' })
  })

  it('uses displayed schema defaults only for absent promoted values and preserves explicit null', async () => {
    const node = promoted({ value: null }, ['options.count', 'value'])
    const definition: WorkflowDefinition = { id: 'defaults', name: 'Defaults', version: 1, execution: { mode }, nodes: [node], edges: [] }
    const consumer = provider('consumer', { inputs: [], configSchema: { properties: {
      options: { type: 'object', properties: { count: { type: 'number', default: 5 } } },
      value: { default: 'replace only absent values' }, unpromoted: { default: 'leave absent' },
    } }, execute: async ({ node: resolved }) => resolved.config })
    const result = await executeWorkflow(definition, {}, { maxParallelNodes: 1, defaultTimeoutMs: 1000, resolveNode: () => consumer })
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ options: { count: 5 }, value: null })
    expect(node.config).toEqual({ value: null })
  })

  it('rejects an invalid wired value before executing the consumer', async () => {
    let consumed = false
    const node = promoted({ amount: 2 }, ['amount'])
    const values: JsonObject = { 'property-amount': 'wrong' }
    const source = provider('source', { inputs: [], outputs: [{ id: 'property-amount', type: 'number' }],
      execute: async () => ({ $runflow: 'port-outputs', outputs: values }) })
    const consumer = provider('consumer', { configSchema: { properties: { amount: { type: 'integer', minimum: 0 } } },
      execute: async () => { consumed = true; return true } })
    const resolveNode = (type: string) => type === 'source' ? source : consumer
    const definition = graph(mode, node, values)
    expect(validateWorkflow(definition, resolveNode)).toEqual([])
    const result = await executeWorkflow(definition, {}, { maxParallelNodes: 1, defaultTimeoutMs: 1000, resolveNode })
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/amount.*integer/i)
    expect(consumed).toBe(false)
  })

  it('binds an implicit edge to the first promoted pin of a node with no ordinary inputs', async () => {
    const source = provider('source', { inputs: [], outputs: [{ id: 'output', type: 'text' }], execute: async () => 'dynamic' })
    const consumer = provider('consumer', { inputs: [], configSchema: { properties: { label: { type: 'string' } } },
      execute: async ({ input, node: resolved }) => ({ label: resolved.config.label!, input }) })
    const definition: WorkflowDefinition = { id: 'implicit', name: 'Implicit', version: 1, execution: { mode },
      nodes: [{ id: 'source', type: 'source', config: {} }, promoted({ label: 'fallback' }, ['label'])],
      edges: [{ from: 'source', to: 'consumer' }] }
    const result = await executeWorkflow(definition, { input: 'initial' }, { maxParallelNodes: 1, defaultTimeoutMs: 1000,
      resolveNode: type => type === 'source' ? source : consumer })
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual({ label: 'dynamic', input: 'initial' })
  })
})

describe('property binding validation', () => {
  const consumer = provider('consumer', { configSchema: { properties: { label: { type: 'string' } } } })
  it.each([
    ['unknown'], ['label', 'label'], ['__proto__.polluted'], ['label..value'], ['retry'], ['timeoutMs'],
  ])('rejects invalid property declarations %j without needing an edge', (...keys) => {
    const node = promoted({}, keys)
    const definition: WorkflowDefinition = { id: 'invalid', name: 'Invalid', version: 1, nodes: [node], edges: [] }
    expect(validateWorkflow(definition, () => consumer)).toEqual([
      expect.objectContaining({ code: 'INVALID_PROPERTY', nodeId: 'consumer' }),
    ])
  })

  it('rejects persisted malformed promoted-input metadata while preserving valid nested paths', () => {
    const definition = { id: 'saved', name: 'Saved', version: 1, nodes: [promoted({}, ['options.enabled'])], edges: [] }
    expect(isWorkflowDocument(definition)).toBe(true)
    for (const promotedInputs of ['label', [7], ['label', 'label'], ['__proto__.polluted'], ['label..value']]) {
      expect(isWorkflowDocument({ ...definition, nodes: [{ ...definition.nodes[0], promotedInputs }] })).toBe(false)
    }
  })

  it.each(['dag', 'state-graph'] as const)('rejects multiple wires and incompatible types on scalar property inputs in %s mode', mode => {
    const source = provider('source', { inputs: [], outputs: [{ id: 'output', type: 'text' }] })
    const definition: WorkflowDefinition = { id: 'wires', name: 'Wires', version: 1, execution: { mode },
      nodes: [{ id: 'one', type: 'source', config: {} }, { id: 'two', type: 'source', config: {} }, promoted({}, ['label'])],
      edges: [{ from: 'one', to: 'consumer', targetPort: 'property-label' }, { from: 'two', to: 'consumer', targetPort: 'property-label' }] }
    const resolveNode = (type: string) => type === 'source' ? source : consumer
    expect(validateWorkflow(definition, resolveNode)).toContainEqual(expect.objectContaining({ code: 'PORT_CARDINALITY' }))
    expect(validateWorkflow({ ...definition, edges: definition.edges.slice(0, 1) },
      type => type === 'source' ? { ...source, outputs: [{ id: 'output', type: 'number' }] } : consumer))
      .toContainEqual(expect.objectContaining({ code: 'PORT_TYPE_MISMATCH' }))
  })
})

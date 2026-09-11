import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import { validateNodeConnection } from '../src/client/connection-planning.ts'

const modes: Array<WorkflowDefinition['execution']> = [undefined, { mode: 'dag' }, { mode: 'state-graph' }, { mode: 'dag', semantics: 'blueprint' }, { mode: 'state-graph', semantics: 'blueprint' }]
function fixture(execution: WorkflowDefinition['execution']) {
  const calls: string[] = []
  const providers: WorkflowNodeDefinition[] = ['left', 'right', 'shared', 'next'].map(id => ({
    type: id, title: id, description: id, category: 'action', icon: 'test', color: '#123456',
    inputs: [{ id: 'in', type: 'flow', multiple: false }], outputs: [{ id: 'out', type: 'flow' }],
    execute: async ({ input }) => { calls.push(id); return id === 'left' || id === 'right' ? id : input },
  }))
  const definition: WorkflowDefinition = {
    id: 'flow-reuse', name: 'Flow reuse', version: 1, ...(execution === undefined ? {} : { execution }),
    nodes: providers.map(provider => ({ id: provider.type, type: provider.type, config: {} })),
    edges: [['left', 'shared'], ['right', 'shared'], ['shared', 'next']].map(([from, to]) => ({ from: from!, to: to!, sourcePort: 'out', targetPort: 'in' })),
  }
  return { definition, calls, providers, engine: { maxParallelNodes: 2, defaultTimeoutMs: 1000, resolveNode: (type: string) => providers.find(p => p.type === type) },
    nodes: providers.map(provider => ({ id: provider.type, data: { inputs: provider.inputs!, outputs: provider.outputs! } })) }
}

describe('all flow inputs support reuse', () => {
  it.each(modes)('accepts a second scalar flow route for %j in both validation layers', execution => {
    const { definition, engine, nodes } = fixture(execution)
    expect(validateWorkflow(definition, engine.resolveNode)).toEqual([])
    const first = { source: 'left', target: 'shared', sourceHandle: 'out', targetHandle: 'in' }
    expect(validateNodeConnection(nodes, { ...first, source: 'right' }, { mode: execution?.mode ?? 'dag', semantics: execution?.semantics, edges: [first] })).toMatchObject({ ok: true })
    expect(validateNodeConnection(nodes, first, { mode: execution?.mode ?? 'dag', semantics: execution?.semantics, edges: [first] })).toMatchObject({ ok: false, reason: 'duplicate' })
  })

  it('preserves legacy DAG scheduling and the saved definition', async () => {
    const { definition, engine, calls } = fixture(undefined)
    const saved = structuredClone(definition)
    const result = await executeWorkflow(definition, {}, engine)
    expect(result.status).toBe('SUCCESS')
    expect(calls.filter(id => id === 'shared')).toHaveLength(1)
    expect(calls.filter(id => id === 'next')).toHaveLength(1)
    expect(definition).toEqual(saved)
  })

  it('invokes a shared Blueprint node and successor for each independent trigger', async () => {
    const { definition, engine, calls } = fixture({ mode: 'state-graph', semantics: 'blueprint', entryNodeIds: ['left', 'right'] })
    const result = await executeWorkflow(definition, {}, engine)
    expect(result.status).toBe('SUCCESS')
    expect(calls.filter(id => id === 'shared')).toHaveLength(2)
    expect(calls.filter(id => id === 'next')).toHaveLength(2)
  })

  it.each([false, true])('preserves legacy state-graph scheduling with multiple=%s flow inputs', async multiple => {
    const { definition, engine, calls, providers } = fixture({ mode: 'state-graph', entryNodeIds: ['left', 'right'] })
    providers.find(provider => provider.type === 'shared')!.inputs![0]!.multiple = multiple
    const received: unknown[] = []
    providers.find(provider => provider.type === 'shared')!.execute = async ({ input }) => { calls.push('shared'); received.push(input); return input }
    const result = await executeWorkflow(definition, {}, engine)
    expect(result.status).toBe('SUCCESS')
    expect(calls.filter(id => id === 'shared')).toHaveLength(1)
    expect(calls.filter(id => id === 'next')).toHaveLength(1)
    expect(received).toEqual([multiple ? ['left', 'right'] : 'right'])
  })
})

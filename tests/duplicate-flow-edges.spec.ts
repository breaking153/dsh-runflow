import { describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition, WorkflowEdge, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'

const modes: Array<WorkflowDefinition['execution']> = [undefined, { mode: 'dag' }, { mode: 'state-graph' }, { mode: 'dag', semantics: 'blueprint' }, { mode: 'state-graph', semantics: 'blueprint' }]
const execute = vi.fn(async () => 'completed')
const provider: WorkflowNodeDefinition = {
  type: 'effect', title: 'Effect', description: '', category: 'action', icon: 'test', color: '#123456',
  inputs: [{ id: 'enter', type: 'flow', multiple: false }],
  outputs: [{ id: 'launch', type: 'flow' }, { id: 'other', type: 'flow' }], execute,
}
const wire: WorkflowEdge = { from: 'source', to: 'sink', sourcePort: 'launch', targetPort: 'enter' }
function graph(edges: WorkflowEdge[], execution?: WorkflowDefinition['execution']): WorkflowDefinition {
  return { id: 'duplicates', name: 'Duplicates', version: 1, ...(execution === undefined ? {} : { execution }),
    nodes: ['source', 'sink'].map(id => ({ id, type: provider.type, config: {} })), edges }
}

describe('Host duplicate wire validation', () => {
  it.each(modes)('rejects an identical explicit wire in %j before running any effects', async execution => {
    execute.mockClear()
    const definition = graph([wire, { ...wire }], execution)
    expect(validateWorkflow(definition, () => provider)).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_EDGE', nodeId: 'sink' }))
    await expect(executeWorkflow(definition, {}, { resolveNode: () => provider, maxParallelNodes: 2, defaultTimeoutMs: 1000 })).rejects.toMatchObject({ issues: [expect.objectContaining({ code: 'DUPLICATE_EDGE' })] })
    expect(execute).not.toHaveBeenCalled()
  })
  it.each([
    [{ from: 'source', to: 'sink' }, wire],
    [wire, { from: 'source', to: 'sink' }],
    [{ from: 'source', to: 'sink', sourcePort: 'launch' }, { from: 'source', to: 'sink', targetPort: 'enter' }],
  ])('normalizes omitted defaults only when the provider describes their ports: %j', (first, second) => {
    expect(validateWorkflow(graph([first, second]), () => provider)).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_EDGE' }))
  })
  it('detects literal duplicates without provider metadata', () => {
    expect(validateWorkflow(graph([wire, { ...wire }]))).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_EDGE' }))
    expect(validateWorkflow(graph([{ from: 'source', to: 'sink' }, { from: 'source', to: 'sink' }]))).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_EDGE' }))
  })
  it('does not guess default port identifiers when metadata is absent', () => {
    const definition = graph([{ from: 'source', to: 'sink' }, wire])
    expect(validateWorkflow(definition)).toEqual([])
    // The existing unavailable-provider fallback is input/output. It is not actual port metadata.
    const unavailable = graph([{ from: 'source', to: 'sink' }, { from: 'source', to: 'sink', sourcePort: 'output', targetPort: 'input' }])
    expect(validateWorkflow(unavailable, () => undefined).some(issue => issue.code === 'DUPLICATE_EDGE')).toBe(false)
  })
  it('preserves distinct flow sources and distinct output pins on one source', () => {
    const fromTwoSources = graph([wire, { ...wire, from: 'other-source' }])
    fromTwoSources.nodes.push({ id: 'other-source', type: provider.type, config: {} })
    expect(validateWorkflow(fromTwoSources, () => provider)).toEqual([])
    expect(validateWorkflow(graph([wire, { ...wire, sourcePort: 'other' }]), () => provider)).toEqual([])
  })
})

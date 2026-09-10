import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowNodeDefinition, WorkflowPortType } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'

const cases: [WorkflowPortType, WorkflowPortType, boolean][] = [
  ['flow', 'flow', true],
  ['flow', 'any', false],
  ['any', 'flow', false],
  ['flow', 'json', false],
  ['json', 'flow', false],
  ['text', 'number', false],
  ['number', 'json', false],
  ['file', 'files', false],
  ['any', 'text', false],
  ['any', 'json', false],
  ['any', 'any', true],
  ['json', 'any', true],
  ['number', 'any', true],
  ['text', 'text', true],
]

function typedGraph(sourceType: WorkflowPortType, targetType: WorkflowPortType) {
  let calls = 0
  const provider = (type: string): WorkflowNodeDefinition => ({
    type, title: type, description: '', category: 'data', color: '', icon: '',
    inputs: [{ id: 'input', type: targetType }], outputs: [{ id: 'output', type: sourceType }],
    async execute() { calls += 1; return null },
  })
  const definition: WorkflowDefinition = {
    id: 'typed-contract', name: 'Typed contract', version: 1,
    nodes: [{ id: 'source', type: 'source', config: {} }, { id: 'sink', type: 'sink', config: {} }],
    edges: [{ from: 'source', to: 'sink' }],
  }
  return { definition, provider, calls: () => calls }
}

describe('execution and data port contracts', () => {
  it.each(cases)('validates %s output to %s input as compatible=%s', (source, target, accepted) => {
    const { definition, provider } = typedGraph(source, target)
    const issues = validateWorkflow(definition, provider)
    if (accepted) expect(issues).toEqual([])
    else expect(issues).toContainEqual(expect.objectContaining({ code: 'PORT_TYPE_MISMATCH', nodeId: 'sink' }))
  })

  it.each(['dag', 'state-graph'] as const)('rejects unknown output into a concrete input before %s providers run', async mode => {
    const { definition, provider, calls } = typedGraph('any', 'number')
    definition.execution = { mode }
    await expect(executeWorkflow(definition, {}, {
      maxParallelNodes: 1, defaultTimeoutMs: 500, resolveNode: provider,
    })).rejects.toThrow('any output source.output cannot connect to number input sink.input')
    expect(calls()).toBe(0)
  })
})

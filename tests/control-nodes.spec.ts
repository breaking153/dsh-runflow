import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import { executeWorkflow } from '../src/engine.ts'
import { controlNodeDefinitions } from '../nodes/control-nodes.ts'

const controls = controlNodeDefinitions()
const runtime = { maxParallelNodes: 4, defaultTimeoutMs: 500, resolveNode: (type: string) => controls.find(node => node.type === type) }
const graph = (nodes: WorkflowDefinition['nodes'], edges: WorkflowDefinition['edges'], initialState = {}): WorkflowDefinition => ({
  id: 'control-test', name: 'Controls', version: 1, nodes, edges, execution: { mode: 'state-graph', entryNodeIds: [nodes[0]!.id], maxSteps: 20, initialState },
})

describe('preset control nodes', () => {
  it('uses state read/update and selects one conditional branch', async () => {
    const result = await executeWorkflow(graph([
      { id: 'set', type: 'state.update', config: { key: 'score', source: 'value', value: 8 } },
      { id: 'branch', type: 'control.branch', config: { source: 'state', path: 'score', operator: 'greaterThan', value: 5 } },
      { id: 'yes', type: 'state.read', config: { path: 'score' } },
      { id: 'no', type: 'control.end', config: {} },
    ], [{ from: 'set', to: 'branch' }, { from: 'branch', sourcePort: 'true', to: 'yes' }, { from: 'branch', sourcePort: 'false', to: 'no' }]), {}, runtime)
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toBe(8)
    expect(result.nodes.find(node => node.nodeId === 'no')?.status).toBe('SKIPPED')
  })

  it('runs the loop body exactly maxIterations times then emits done', async () => {
    const result = await executeWorkflow(graph([
      { id: 'loop', type: 'control.loop', config: { maxIterations: 3 } },
      { id: 'body', type: 'state.update', config: { key: 'visits', source: 'value', value: 1 } },
      { id: 'end', type: 'state.read', config: { path: 'visits' } },
    ], [{ from: 'loop', sourcePort: 'continue', to: 'body' }, { from: 'body', to: 'loop' }, { from: 'loop', sourcePort: 'done', to: 'end' }], { visits: 0 }), {}, { ...runtime })
    // Replacement is intentional here: the history is the evidence of three visits.
    expect(result.status).toBe('SUCCESS')
    expect(result.steps?.flatMap(step => step.nodes).filter(node => node.nodeId === 'body')).toHaveLength(3)
  })

  it('routes switch cases and fallback as separate ports', async () => {
    const definition = graph([
      { id: 'switch', type: 'control.switch', config: { rules: [{ path: 'kind', value: 'a' }, { path: 'kind', value: 'b' }] } },
      { id: 'a', type: 'control.end', config: {} }, { id: 'b', type: 'control.end', config: {} }, { id: 'fallback', type: 'control.end', config: {} },
    ], [{ from: 'switch', sourcePort: 'case1', to: 'a' }, { from: 'switch', sourcePort: 'case2', to: 'b' }, { from: 'switch', sourcePort: 'default', to: 'fallback' }])
    const result = await executeWorkflow(definition, { input: { kind: 'b' } }, runtime)
    expect(result.status).toBe('SUCCESS')
    expect(result.nodes.filter(node => node.status === 'SUCCESS').map(node => node.nodeId)).toEqual(['switch', 'b'])
    expect(result.output).toEqual({ kind: 'b' })
  })

  it('fans out and joins every configured branch', async () => {
    const result = await executeWorkflow(graph([
      { id: 'parallel', type: 'control.parallel', config: { branchCount: 3 } },
      { id: 'join', type: 'control.join', config: {} },
    ], [1, 2, 3].map(index => ({ from: 'parallel', sourcePort: 'branch' + index, to: 'join' }))), { input: 'value' }, runtime)
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual(['value', 'value', 'value'])
  })

  it('resumes the interrupt node with an explicit answer', async () => {
    const definition = graph([{ id: 'approval', type: 'control.interrupt', config: { prompt: { text: 'Proceed?' }, stateKey: 'approved' } }], [])
    const paused = await executeWorkflow(definition, {}, runtime)
    expect(paused.status).toBe('PAUSED')
    const resumed = await executeWorkflow(definition, { checkpoint: paused.checkpoint!, resumeValues: { approval: false } }, runtime)
    expect(resumed.status).toBe('SUCCESS')
    expect(resumed.state).toEqual({ approved: false })
    expect(resumed.output).toBe(false)
  })

  it('rejects prototype traversal and invalid control configuration', async () => {
    const result = await executeWorkflow(graph([{ id: 'read', type: 'state.read', config: { path: '__proto__.polluted' } }], []), {}, runtime)
    expect(result.status).toBe('FAILED')
    expect(result.error).toContain('reserved')
    const oversized = await executeWorkflow(graph([{ id: 'split', type: 'control.parallel', config: { branchCount: 200 } }], []), {}, runtime)
    expect(oversized.status).toBe('FAILED')
  })
})

import { describe, expect, it } from 'vitest'
import type { JsonValue, WorkflowDefinition, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'

function workflow(nodes: WorkflowDefinition['nodes'], edges: WorkflowDefinition['edges']): WorkflowDefinition {
  return { id: 'test-flow', name: 'Test Flow', version: 1, nodes, edges }
}

function provider(type: string, execute: WorkflowNodeDefinition['execute']): WorkflowNodeDefinition {
  return { type, title: type, description: type, category: 'action', color: '#fff', icon: 'test', execute }
}

describe('workflow engine', () => {
  it('rejects cycles before executing nodes', () => {
    const issues = validateWorkflow(workflow([
      { id: 'a', type: 'echo', config: {} },
      { id: 'b', type: 'echo', config: {} },
    ], [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ]))
    expect(issues).toContainEqual(expect.objectContaining({ code: 'CYCLE' }))
  })

  it('executes independent branches concurrently and merges terminal outputs', async () => {
    let active = 0
    let peak = 0
    const definitions = new Map<string, WorkflowNodeDefinition>()
    definitions.set('source', provider('source', async () => ({ value: 3 })))
    definitions.set('branch', provider('branch', async ({ node, input }) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 10))
      active -= 1
      return { branch: node.id, input }
    }))
    const execution = await executeWorkflow(workflow([
      { id: 'source', type: 'source', config: {} },
      { id: 'left', type: 'branch', config: {} },
      { id: 'right', type: 'branch', config: {} },
    ], [
      { from: 'source', to: 'left' },
      { from: 'source', to: 'right' },
    ]), {}, {
      maxParallelNodes: 2,
      defaultTimeoutMs: 500,
      resolveNode: type => definitions.get(type),
    })
    expect(execution.status).toBe('SUCCESS')
    expect(peak).toBe(2)
    expect(execution.output).toEqual(expect.objectContaining({ left: expect.any(Object), right: expect.any(Object) }))
  })

  it('skips a condition branch that does not match', async () => {
    const definitions = new Map<string, WorkflowNodeDefinition>([
      ['condition', provider('condition', async () => ({ matched: true }))],
      ['echo', provider('echo', async ({ input }) => input)],
    ])
    const execution = await executeWorkflow(workflow([
      { id: 'condition', type: 'condition', config: {} },
      { id: 'yes', type: 'echo', config: {} },
      { id: 'no', type: 'echo', config: {} },
    ], [
      { from: 'condition', to: 'yes', condition: true },
      { from: 'condition', to: 'no', condition: false },
    ]), { input: { ok: true } as JsonValue }, {
      maxParallelNodes: 2,
      defaultTimeoutMs: 500,
      resolveNode: type => definitions.get(type),
    })
    expect(execution.nodes.find(node => node.nodeId === 'yes')?.status).toBe('SUCCESS')
    expect(execution.nodes.find(node => node.nodeId === 'no')?.status).toBe('SKIPPED')
  })
})

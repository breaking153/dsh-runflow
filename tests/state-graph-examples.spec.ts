import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import type { WorkflowDefinition } from '../src/contracts.ts'

const providers = builtinNodeDefinitions(async () => { throw new Error('Example must not call a real Agent') })
const engine = { maxParallelNodes: 4, defaultTimeoutMs: 1000, resolveNode: (type: string) => providers.find(node => node.type === type) }
const load = async (name: string): Promise<WorkflowDefinition> => JSON.parse(await readFile(new URL('../examples/workflows/' + name + '.workflow.json', import.meta.url), 'utf8')) as WorkflowDefinition

describe('Packaged state-graph examples', () => {
  it('executes the bounded loop three times', async () => {
    const definition = await load('bounded-loop')
    expect(validateWorkflow(definition, engine.resolveNode)).toEqual([])
    const execution = await executeWorkflow(definition, { entryNodeIds: ['manual'] }, engine)
    expect(execution.status).toBe('SUCCESS')
    expect(execution.output).toBe(3)
    expect(execution.steps?.flatMap(step => step.nodes).filter(node => node.nodeId === 'increment')).toHaveLength(3)
  })
  it('merges parallel state updates and activates only the requested entry', async () => {
    const execution = await executeWorkflow(await load('parallel-reduce'), { agentId: 'test-owner', trigger: 'agent', entryNodeIds: ['agent'] }, engine)
    expect(execution.status).toBe('SUCCESS')
    expect(execution.output).toBe(5)
    expect(execution.nodes.find(node => node.nodeId === 'manual')?.status).toBe('SKIPPED')
  })
  it('tests webhook review through its manual entry and resumes only the approved branch', async () => {
    const definition = await load('webhook-review')
    const paused = await executeWorkflow(definition, { entryNodeIds: ['manual'], input: { item: 'example' } }, engine)
    expect(paused.status).toBe('PAUSED')
    expect(paused.state?.request).toEqual({ item: 'example' })
    const resumed = await executeWorkflow(definition, { checkpoint: paused.checkpoint!, resumeValues: { review: true } }, engine)
    expect(resumed.status).toBe('SUCCESS')
    expect(resumed.nodes.find(node => node.nodeId === 'accepted')?.status).toBe('SUCCESS')
    expect(resumed.nodes.find(node => node.nodeId === 'declined')?.status).toBe('SKIPPED')
  })
})

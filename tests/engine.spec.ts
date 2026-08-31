import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { JsonValue, WorkflowDefinition, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import { FileExecutionOutput } from '../src/output-store.ts'

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

  it('uses one provider snapshot for the entire workflow execution', async () => {
    let calls = 0
    let resolverCalls = 0
    const definitions = new Map<string, WorkflowNodeDefinition>()
    const replacement = provider('versioned', async () => 'new generation')
    definitions.set('versioned', provider('versioned', async () => {
      calls += 1
      if (calls === 1) definitions.set('versioned', replacement)
      return 'old generation ' + String(calls)
    }))

    const execution = await executeWorkflow(workflow([
      { id: 'first', type: 'versioned', config: {} },
      { id: 'second', type: 'versioned', config: {} },
    ], [{ from: 'first', to: 'second' }]), {}, {
      maxParallelNodes: 1,
      defaultTimeoutMs: 500,
      resolveNode: type => {
        resolverCalls += 1
        return definitions.get(type)
      },
    })

    expect(execution.status).toBe('SUCCESS')
    expect(execution.nodes.find(node => node.nodeId === 'first')?.output).toBe('old generation 1')
    expect(execution.nodes.find(node => node.nodeId === 'second')?.output).toBe('old generation 2')
    expect(resolverCalls).toBe(1)
  })
})

describe('typed ports and execution output', () => {
  it('routes explicit typed multi-output ports and rejects incompatible connections', async () => {
    const definitions = new Map<string, WorkflowNodeDefinition>([
      ['typed.source', {
        ...provider('typed.source', async () => ({
          $runflow: 'port-outputs',
          outputs: { text: 'hello', count: 2 },
        })),
        inputs: [],
        outputs: [
          { id: 'text', type: 'text' },
          { id: 'count', type: 'number' },
        ],
      }],
      ['typed.text-sink', {
        ...provider('typed.text-sink', async ({ inputs }) => inputs.message ?? null),
        inputs: [{ id: 'message', type: 'text' }],
        outputs: [{ id: 'result', type: 'text' }],
      }],
      ['typed.number-sink', {
        ...provider('typed.number-sink', async ({ inputs }) => inputs.value ?? null),
        inputs: [{ id: 'value', type: 'number' }],
        outputs: [{ id: 'result', type: 'number' }],
      }],
    ])
    const definition = workflow([
      { id: 'source', type: 'typed.source', config: {} },
      { id: 'text', type: 'typed.text-sink', config: {} },
      { id: 'count', type: 'typed.number-sink', config: {} },
    ], [
      { from: 'source', sourcePort: 'text', to: 'text', targetPort: 'message' },
      { from: 'source', sourcePort: 'count', to: 'count', targetPort: 'value' },
    ])

    const execution = await executeWorkflow(definition, {}, {
      maxParallelNodes: 2,
      defaultTimeoutMs: 500,
      resolveNode: type => definitions.get(type),
    })

    expect(execution.status).toBe('SUCCESS')
    expect(execution.nodes.find(node => node.nodeId === 'source')?.outputPorts).toEqual({ text: 'hello', count: 2 })
    expect(execution.nodes.find(node => node.nodeId === 'text')?.inputPorts).toEqual({ message: 'hello' })
    expect(execution.nodes.find(node => node.nodeId === 'count')?.inputPorts).toEqual({ value: 2 })

    const incompatible = workflow([
      { id: 'source', type: 'typed.source', config: {} },
      { id: 'text', type: 'typed.text-sink', config: {} },
    ], [{ from: 'source', sourcePort: 'count', to: 'text', targetPort: 'message' }])
    expect(validateWorkflow(incompatible, type => definitions.get(type))).toContainEqual(
      expect.objectContaining({ code: 'PORT_TYPE_MISMATCH', nodeId: 'text' }),
    )
  })

  it('persists consolidated outputs and intermediate debug artifacts per execution', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'dsh-runflow-output-'))
    const definition = workflow([{ id: 'collector', type: 'collector', config: {} }], [])
    const definitions = new Map<string, WorkflowNodeDefinition>([
      ['collector', provider('collector', async context => {
        context.log('collecting records', { count: 1 })
        await context.writeIntermediate('raw-response', { rows: [{ id: 1 }] }, 'result')
        return { records: 1 }
      })],
    ])
    try {
      const execution = await executeWorkflow(definition, { input: { query: 'risk' } }, {
        maxParallelNodes: 1,
        defaultTimeoutMs: 500,
        resolveNode: type => definitions.get(type),
        createOutput: current => new FileExecutionOutput(baseDir, definition, current),
      })

      expect(execution.status).toBe('SUCCESS')
      expect(execution.outputDir).toContain(baseDir)
      expect(execution.artifacts).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'intermediate', nodeId: 'collector' }),
        expect.objectContaining({ kind: 'logs', nodeId: 'collector' }),
        expect.objectContaining({ kind: 'manifest', label: 'Execution manifest' }),
      ]))
      const manifest = execution.artifacts?.find(artifact => artifact.label === 'Execution manifest')
      expect(manifest).toBeDefined()
      const stored = JSON.parse(await readFile(manifest!.path, 'utf8')) as { status: string; outputDir: string }
      expect(stored.status).toBe('SUCCESS')
      expect(stored.outputDir).toBe(execution.outputDir)
    } finally {
      await rm(baseDir, { recursive: true, force: true })
    }
  })
})

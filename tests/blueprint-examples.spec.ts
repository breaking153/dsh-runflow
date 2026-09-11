import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import { executeWorkflow, validateWorkflow } from '../src/engine.ts'
import type { WorkflowDefinition } from '../src/contracts.ts'

const providers = builtinNodeDefinitions(async () => { throw new Error('Example must not call a real Agent') })
const engine = { maxParallelNodes: 4, defaultTimeoutMs: 1000, resolveNode: (type: string) => providers.find(node => node.type === type) }

it('runs the Blueprint values example using promoted parameters and data values on demand', async () => {
  const definition = JSON.parse(await readFile(new URL('../examples/workflows/blueprint-values.workflow.json', import.meta.url), 'utf8')) as WorkflowDefinition
  expect(validateWorkflow(definition, engine.resolveNode)).toEqual([])
  const execution = await executeWorkflow(definition, { entryNodeIds: ['manual'] }, engine)
  expect(execution.status, JSON.stringify(execution.nodes)).toBe('SUCCESS')
  expect(execution.output).toEqual({ message: 'Hello Blueprint', ready: false })
  expect(execution.nodes.find(node => node.nodeId === 'wait')?.status).toBe('SUCCESS')
})

import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import { FlowService } from '../src/flow-service.ts'
import { RunFlowRemoteService } from '../src/remote-service.ts'

const roots: string[] = []

async function testRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-remote-'))
  roots.push(root)
  return root
}

async function settled(
  remote: RunFlowRemoteService,
  agent: Agent,
  executionId: string,
): Promise<WorkflowExecution> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const execution = remote.execution(agent, executionId)
    if (execution !== null && execution.status !== 'RUNNING' && execution.status !== 'PENDING') {
      return execution
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('execution did not settle')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('RunFlow Host Remote', () => {
  it('hot-loads a workflow definition edited on disk', async () => {
    const root = await testRoot()
    const workflowsDir = join(root, 'workflows')
    await mkdir(workflowsDir, { recursive: true })
    const ctx = new Context()
    const flow = new FlowService(ctx, {
      nodesDir: join(root, 'nodes'), storageDir: join(root, 'workspace'), workflowsDir,
    })
    await writeFile(join(workflowsDir, 'external.workflow.json'), JSON.stringify({
      id: 'external-flow', name: 'External flow', version: 1,
      nodes: [{ id: 'manual', type: 'trigger.manual', config: {} }], edges: [],
    }), 'utf8')
    for (let attempt = 0; attempt < 50 && flow.workflow('external-flow') === undefined; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    expect(flow.workflow('external-flow')).toEqual(expect.objectContaining({ name: 'External flow' }))
  })

  it('starts a real Host execution, slices node debug to ancestors, and isolates Agent ownership', async () => {
    const root = await testRoot()
    const ctx = new Context()
    new FlowService(ctx, {
      outputDir: join(root, 'output'), nodesDir: join(root, 'nodes'),
      storageDir: join(root, 'workspace'), workflowsDir: join(root, 'workflows'),
    })
    const remote = new RunFlowRemoteService(ctx)
    const agent = { id: 'agent-a' } as Agent
    const other = { id: 'agent-b' } as Agent
    const definition: WorkflowDefinition = {
      id: 'remote-real-run',
      name: 'Remote real run',
      version: 1,
      nodes: [
        { id: 'manual', type: 'trigger.manual', config: {} },
        { id: 'set', type: 'builtin.set', config: { values: { checked: true } } },
        { id: 'storage', type: 'storage.write', config: { collection: 'results' } },
      ],
      edges: [
        { from: 'manual', to: 'set', sourcePort: 'output', targetPort: 'input' },
        { from: 'set', to: 'storage', sourcePort: 'output', targetPort: 'input' },
      ],
    }

    const receipt = remote.start(agent, {
      definition,
      input: { source: 'test' },
      targetNodeId: 'set',
    })
    expect(receipt.execution.status).toBe('RUNNING')
    expect(receipt.execution.nodes.map(node => node.nodeId)).toEqual(['manual', 'set'])
    expect(() => remote.execution(other, receipt.executionId)).toThrow(/not owned/)

    const execution = await settled(remote, agent, receipt.executionId)
    expect(execution.status).toBe('SUCCESS')
    expect(execution.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ nodeId: 'manual', status: 'SUCCESS' }),
      expect.objectContaining({ nodeId: 'set', status: 'SUCCESS' }),
    ]))
    expect(execution.outputDir).toContain(receipt.executionId)
    expect(remote.workspace(agent).workflows).toEqual([expect.objectContaining({ id: definition.id })])
    expect(await readdir(join(root, 'workflows'))).toEqual([expect.stringMatching(/\.workflow\.json$/)])

  })

  it('cancels a live Host node through the same Agent-authorized channel', async () => {
    const root = await testRoot()
    const ctx = new Context()
    const flow = new FlowService(ctx, {
      outputDir: join(root, 'output'), nodesDir: join(root, 'nodes'),
      storageDir: join(root, 'workspace'), workflowsDir: join(root, 'workflows'),
    })
    flow.registerNode({
      type: 'test.slow',
      title: 'Slow',
      description: 'Cancellation probe',
      category: 'action',
      color: '#fff',
      icon: 'clock',
      inputs: [],
      outputs: [{ id: 'output', type: 'json' }],
      execute: async ({ signal }) => await new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ late: true }), 5_000)
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new Error('cancelled'))
        }, { once: true })
      }),
    })
    const remote = new RunFlowRemoteService(ctx)
    const agent = { id: 'agent-cancel' } as Agent
    const receipt = remote.start(agent, {
      definition: {
        id: 'cancel-run',
        name: 'Cancel run',
        version: 1,
        nodes: [{ id: 'slow', type: 'test.slow', config: {} }],
        edges: [],
      },
    })

    expect(remote.cancel(agent, receipt.executionId)).toBe(true)
    const execution = await settled(remote, agent, receipt.executionId)
    expect(execution.status).toBe('CANCELLED')
    expect(execution.nodes[0]?.status).toBe('CANCELLED')

  })
  it('persists workflow status and execution history for the Host workspace', async () => {
    const root = await testRoot()
    const storageDir = join(root, 'workspace')
    const workflowsDir = join(root, 'workflows')
    const definition: WorkflowDefinition = {
      id: 'managed-flow',
      name: 'Managed flow',
      version: 1,
      nodes: [{ id: 'manual', type: 'trigger.manual', config: {} }],
      edges: [],
    }
    const ctx = new Context()
    new FlowService(ctx, { outputDir: join(root, 'output'), nodesDir: join(root, 'nodes'), storageDir, workflowsDir })
    const remote = new RunFlowRemoteService(ctx)
    const agent = { id: 'agent-workspace' } as Agent

    const saved = remote.save(agent, definition)
    expect(saved.version).toBe(1)
    expect(await readdir(workflowsDir)).toEqual([expect.stringMatching(/\.workflow\.json$/)])
    expect(remote.publish(agent, definition.id, true).published).toBe(true)
    const receipt = remote.start(agent, { definition: saved, input: { ok: true } })
    await settled(remote, agent, receipt.executionId)

    const restoredContext = new Context()
    new FlowService(restoredContext, { outputDir: join(root, 'output-2'), nodesDir: join(root, 'nodes-2'), storageDir, workflowsDir })
    const restored = new RunFlowRemoteService(restoredContext).workspace(agent)
    expect(restored.workflows).toEqual([expect.objectContaining({ id: definition.id, published: true })])
    expect(restored.executions).toEqual([expect.objectContaining({ workflowId: definition.id, status: 'SUCCESS' })])
  })
})

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition, WorkflowExecution } from '../src/contracts.ts'
import {
  FileExecutionRepository,
  FileWorkflowRepository,
} from '../src/backend/v2/file-repositories.ts'

const roots: string[] = []

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'runflow-v2-repository-'))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(value => rm(value, { recursive: true, force: true })))
})

const workflow = (name = 'Repository flow'): WorkflowDefinition => ({
  id: 'repository-flow',
  name,
  version: 1,
  nodes: [{ id: 'manual', type: 'trigger.manual', config: {} }],
  edges: [],
})

const execution = (id: string, startedAt: string): WorkflowExecution => ({
  id,
  workflowId: 'repository-flow',
  version: 1,
  status: 'SUCCESS',
  trigger: 'test',
  startedAt,
  finishedAt: startedAt,
  nodes: [],
})

describe('backend v2 file repositories', () => {
  it('uses one workflow file as the only durable definition authority', async () => {
    const directory = await root()
    const repository = new FileWorkflowRepository(directory)

    repository.save(workflow())
    repository.save(workflow('Updated flow'))

    expect(await readdir(directory)).toEqual([expect.stringMatching(/\.workflow\.json$/)])
    expect(repository.get('repository-flow')?.name).toBe('Updated flow')
    const returned = repository.get('repository-flow')!
    returned.name = 'mutated by caller'
    expect(repository.get('repository-flow')?.name).toBe('Updated flow')

    const restored = new FileWorkflowRepository(directory)
    expect(restored.list()).toEqual([expect.objectContaining({ id: 'repository-flow', name: 'Updated flow' })])
    expect(restored.delete('repository-flow')).toBe(true)
    expect(await readdir(directory)).toEqual([])
  })

  it('ignores malformed external workflow files without poisoning valid state', async () => {
    const directory = await root()
    const warn = vi.fn()
    await writeFile(join(directory, 'broken.workflow.json'), '{', 'utf8')
    const repository = new FileWorkflowRepository(directory, warn)

    expect(repository.list()).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('broken.workflow.json'))
  })

  it.each([
    ['timestamp', { updatedAt: 123 }],
    ['node', { nodes: [null] }],
    ['node config', { nodes: [{ id: 'a', type: 'test.fixture', config: [] }] }],
    ['edge', { edges: [{ from: 'manual', to: 42 }] }],
    ['position', { nodes: [{ id: 'a', type: 'test.fixture', config: {}, position: { x: '0', y: 0 } }] }],
    ['UI groups', { ui: { schemaVersion: 1, groups: [null], reroutes: [], visualEdges: [] } }],
    ['UI subflows', { ui: { schemaVersion: 1, groups: [], reroutes: [], visualEdges: [], subflows: [null] } }],
  ])('ignores a workflow with an invalid %s while retaining valid definitions', async (_label, patch) => {
    const directory = await root()
    new FileWorkflowRepository(directory).save(workflow())
    await writeFile(join(directory, 'invalid.workflow.json'), JSON.stringify({
      ...workflow(), id: 'invalid-workflow', ...patch,
    }))
    const warn = vi.fn()
    const repository = new FileWorkflowRepository(directory, warn)

    expect(repository.list().map(item => item.id)).toEqual(['repository-flow'])
    expect(repository.get('invalid-workflow')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid.workflow.json'))
  })

  it.each([
    ['timestamp', { startedAt: 123 }],
    ['status', { status: 'UNKNOWN' }],
    ['node', { nodes: [null] }],
    ['node status', { nodes: [{ nodeId: 'a', status: 'UNKNOWN', attempts: 1 }] }],
    ['node attempts', { nodes: [{ nodeId: 'a', status: 'SUCCESS', attempts: 'one' }] }],
    ['node logs', { nodes: [{ nodeId: 'a', status: 'SUCCESS', attempts: 1, logs: [null] }] }],
    ['artifacts', { artifacts: [null] }],
  ])('ignores an execution with an invalid %s while retaining valid history', async (_label, patch) => {
    const directory = await root()
    new FileExecutionRepository(directory).save(execution('valid-run', '2026-09-01T00:00:00.000Z'))
    await writeFile(join(directory, 'invalid.execution.json'), JSON.stringify({
      ...execution('invalid-run', '2026-09-02T00:00:00.000Z'), ...patch,
    }))
    const warn = vi.fn()
    const repository = new FileExecutionRepository(directory, warn)

    expect(repository.list().map(item => item.id)).toEqual(['valid-run'])
    expect(repository.get('invalid-run')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('invalid.execution.json'))
  })

  it('keeps an externally named workflow as a single file when saving an edit', async () => {
    const directory = await root()
    const path = join(directory, 'external.workflow.json')
    await writeFile(path, JSON.stringify(workflow()))
    const repository = new FileWorkflowRepository(directory)

    repository.save(workflow('Edited external flow'))

    expect(await readdir(directory)).toEqual(['external.workflow.json'])
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ name: 'Edited external flow' })
    expect(new FileWorkflowRepository(directory).get('repository-flow')?.name).toBe('Edited external flow')
  })

  it('restores valid editor metadata, detailed execution records, and document extensions unchanged', async () => {
    const directory = await root()
    const position = { x: 1, y: 2 }
    const group = { id: 'group', label: 'Group', position, width: 300, height: 200, nodeIds: ['manual'] }
    const reroute = { id: 'reroute', position }
    const visualEdge = { id: 'visual-edge', source: 'manual', target: 'reroute', sourceHandle: 'output' }
    const definition = {
      ...workflow(),
      createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
      outputDir: 'output', extension: { futureField: true },
      ui: {
        schemaVersion: 1,
        groups: [group], reroutes: [reroute], visualEdges: [visualEdge],
        linksVisible: true, minimapVisible: false,
        subflows: [{
          id: 'subflow', label: 'Subflow', position, nodes: workflow().nodes, edges: [],
          inputs: [], outputs: [{ id: 'out', label: 'Out', type: 'json', nodeId: 'manual', nodePortId: 'output' }],
          groups: [group], reroutes: [reroute], visualEdges: [visualEdge],
        }],
      },
    }
    const artifact = {
      kind: 'output', label: 'Result', path: 'output/result.json', mediaType: 'application/json',
      nodeId: 'manual', portId: 'output', bytes: 2, preview: '{}',
    }
    const detailedExecution = {
      ...execution('detailed-run', '2026-09-02T00:00:00.000Z'),
      input: null, output: { result: true }, outputDir: 'output', artifacts: [artifact],
      nodes: [{
        nodeId: 'manual', status: 'SUCCESS', attempts: 1,
        inputPorts: {}, outputPorts: { output: null }, startedAt: '2026-09-02T00:00:00.000Z',
        finishedAt: '2026-09-02T00:00:00.001Z', durationMs: 1,
        logs: [{ timestamp: '2026-09-02T00:00:00.000Z', level: 'info', message: 'Fixture', data: null }],
        artifacts: [artifact],
      }],
    }
    await writeFile(join(directory, 'editor.workflow.json'), JSON.stringify(definition))
    await writeFile(join(directory, 'detailed.execution.json'), JSON.stringify(detailedExecution))

    expect(new FileWorkflowRepository(directory).get('repository-flow')).toEqual(definition)
    expect(new FileExecutionRepository(directory).get('detailed-run')).toEqual(detailedExecution)
  })

  it('persists each execution independently and restores newest-first history', async () => {
    const directory = await root()
    const repository = new FileExecutionRepository(directory)
    repository.save(execution('older', '2026-09-01T00:00:00.000Z'))
    repository.save(execution('newer', '2026-09-02T00:00:00.000Z'))

    expect(await readdir(directory)).toHaveLength(2)
    expect(repository.list(undefined, 1).map(item => item.id)).toEqual(['newer'])
    expect(new FileExecutionRepository(directory).get('older')).toEqual(expect.objectContaining({ status: 'SUCCESS' }))
  })
})

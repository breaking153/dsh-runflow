import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  migrateLegacyRunFlowRuntime,
  resolveRunFlowRuntimePaths,
} from '../src/runtime-paths.ts'

describe('RunFlow runtime paths', () => {
  it('keeps default data, workflows, and output below the dedicated user directory', () => {
    const home = resolve('fixture-home')
    expect(resolveRunFlowRuntimePaths({}, home)).toEqual({
      rootDir: join(home, '.dsh_agent_workflow'),
      dataDir: join(home, '.dsh_agent_workflow', 'data'),
      workspaceFile: join(home, '.dsh_agent_workflow', 'data', 'workspace.json'),
      workflowsDir: join(home, '.dsh_agent_workflow', 'data', 'workflows'),
      outputDir: join(home, '.dsh_agent_workflow', 'output'),
    })
  })

  it('imports cwd and plugin-local legacy state once without deleting its source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-runflow-runtime-paths-'))
    const home = join(root, 'home')
    const cwd = join(root, 'workspace')
    const pluginRoot = join(root, 'plugin')
    const legacyData = join(cwd, 'data', 'runflow')
    const legacyWorkflows = join(pluginRoot, 'workflows')
    await mkdir(legacyData, { recursive: true })
    await mkdir(legacyWorkflows, { recursive: true })
    await writeFile(join(legacyData, 'workspace.json'), '{"workflows":[],"executions":[]}', 'utf8')
    await writeFile(join(legacyWorkflows, 'demo.workflow.json'), '{"id":"demo"}', 'utf8')

    try {
      const first = migrateLegacyRunFlowRuntime({ cwd, pluginRoot, userHome: home })
      expect(first.alreadyChecked).toBe(false)
      expect(first.importedWorkspace).toBe(join(legacyData, 'workspace.json'))
      expect(first.importedWorkflows).toEqual([join(legacyWorkflows, 'demo.workflow.json')])
      await expect(readFile(first.paths.workspaceFile, 'utf8')).resolves.toContain('"executions"')
      await expect(readFile(join(first.paths.workflowsDir, 'demo.workflow.json'), 'utf8')).resolves.toContain('"demo"')
      await expect(readFile(join(legacyData, 'workspace.json'), 'utf8')).resolves.toContain('"workflows"')

      const second = migrateLegacyRunFlowRuntime({ cwd, pluginRoot, userHome: home })
      expect(second).toMatchObject({ alreadyChecked: true, importedWorkflows: [] })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

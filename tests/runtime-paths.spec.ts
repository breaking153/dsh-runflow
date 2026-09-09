import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRunFlowRuntimePaths } from '../src/runtime-paths.ts'

describe('RunFlow runtime paths', () => {
  it('keeps v2 workflow, execution, and output state below the dedicated user directory', () => {
    const home = resolve('fixture-home')
    expect(resolveRunFlowRuntimePaths({}, home)).toEqual({
      rootDir: join(home, '.dsh_agent_workflow'),
      dataDir: join(home, '.dsh_agent_workflow', 'data'),
      workflowsDir: join(home, '.dsh_agent_workflow', 'data', 'workflows'),
      executionsDir: join(home, '.dsh_agent_workflow', 'data', 'executions'),
      outputDir: join(home, '.dsh_agent_workflow', 'output'),
    })
  })
})

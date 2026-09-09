import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const RUNFLOW_HOME_NAME = '.dsh_agent_workflow'

export interface RunFlowPathConfig {
  outputDir?: string
  storageDir?: string
  workflowsDir?: string
  executionsDir?: string
}

export interface RunFlowRuntimePaths {
  rootDir: string
  dataDir: string
  workflowsDir: string
  executionsDir: string
  outputDir: string
}

/** Resolve all v2 runtime-owned state outside DSH and plugin checkouts. */
export function resolveRunFlowRuntimePaths(
  config: RunFlowPathConfig = {},
  userHome = homedir(),
): RunFlowRuntimePaths {
  const rootDir = resolve(userHome, RUNFLOW_HOME_NAME)
  const dataDir = resolve(config.storageDir ?? join(rootDir, 'data'))
  return {
    rootDir,
    dataDir,
    workflowsDir: resolve(config.workflowsDir ?? join(dataDir, 'workflows')),
    executionsDir: resolve(config.executionsDir ?? join(dataDir, 'executions')),
    outputDir: resolve(config.outputDir ?? join(rootDir, 'output')),
  }
}

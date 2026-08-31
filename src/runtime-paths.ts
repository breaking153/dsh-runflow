import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const RUNFLOW_HOME_NAME = '.dsh_agent_workflow'

export interface RunFlowPathConfig {
  outputDir?: string
  storageDir?: string
  workflowsDir?: string
}

export interface RunFlowRuntimePaths {
  rootDir: string
  dataDir: string
  workspaceFile: string
  workflowsDir: string
  outputDir: string
}

/** Resolve runtime-owned state outside both the DSH checkout and plugin installation. */
export function resolveRunFlowRuntimePaths(
  config: RunFlowPathConfig = {},
  userHome = homedir(),
): RunFlowRuntimePaths {
  const rootDir = resolve(userHome, RUNFLOW_HOME_NAME)
  const dataDir = resolve(config.storageDir ?? join(rootDir, 'data'))
  return {
    rootDir,
    dataDir,
    workspaceFile: join(dataDir, 'workspace.json'),
    workflowsDir: resolve(config.workflowsDir ?? join(dataDir, 'workflows')),
    outputDir: resolve(config.outputDir ?? join(rootDir, 'output')),
  }
}

export interface LegacyRunFlowMigrationOptions {
  cwd: string
  pluginRoot: string
  userHome?: string
}

export interface LegacyRunFlowMigrationReport {
  paths: RunFlowRuntimePaths
  importedWorkspace?: string
  importedWorkflows: string[]
  alreadyChecked: boolean
}

/**
 * Import the old cwd/plugin-local state once, by copying only. The legacy files
 * are deliberately not deleted automatically so an upgrade remains recoverable.
 */
export function migrateLegacyRunFlowRuntime(
  options: LegacyRunFlowMigrationOptions,
): LegacyRunFlowMigrationReport {
  const paths = resolveRunFlowRuntimePaths({}, options.userHome)
  const marker = join(paths.dataDir, '.legacy-import-v1.json')
  mkdirSync(paths.workflowsDir, { recursive: true })
  mkdirSync(paths.outputDir, { recursive: true })
  if (existsSync(marker)) {
    return { paths, importedWorkflows: [], alreadyChecked: true }
  }

  const legacyDataDir = resolve(options.cwd, 'data', 'runflow')
  let importedWorkspace: string | undefined
  if (!existsSync(paths.workspaceFile)) {
    const source = [join(legacyDataDir, 'workspace.json')].find(existsSync)
    if (source !== undefined) {
      copyFileSync(source, paths.workspaceFile)
      importedWorkspace = source
    }
  }

  const importedWorkflows: string[] = []
  const legacyWorkflowDirs = [
    join(legacyDataDir, 'workflows'),
    resolve(options.pluginRoot, 'workflows'),
  ]
  for (const directory of [...new Set(legacyWorkflowDirs)]) {
    if (!existsSync(directory)) continue
    for (const name of readdirSync(directory).filter(candidate => candidate.endsWith('.workflow.json')).sort()) {
      const target = join(paths.workflowsDir, name)
      if (existsSync(target)) continue
      const source = join(directory, name)
      copyFileSync(source, target)
      importedWorkflows.push(source)
    }
  }

  writeFileSync(marker, JSON.stringify({
    importedAt: new Date().toISOString(),
    importedWorkspace: importedWorkspace ?? null,
    importedWorkflows,
  }, null, 2) + '\n', 'utf8')
  return {
    paths,
    ...(importedWorkspace === undefined ? {} : { importedWorkspace }),
    importedWorkflows,
    alreadyChecked: false,
  }
}

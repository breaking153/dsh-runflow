import { randomUUID } from 'node:crypto'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type {
  ExecutionArtifact,
  JsonObject,
  JsonValue,
  NodeExecutionRecord,
  WorkflowDefinition,
  WorkflowExecution,
} from './contracts.ts'

const JSON_MEDIA_TYPE = 'application/json'

function safeSegment(value: string): string {
  const normalized = value.trim().replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '')
  return normalized.slice(0, 96) || 'item'
}

function previewOf(value: JsonValue, maxLength = 240): string {
  const rendered = JSON.stringify(value)
  return rendered.length <= maxLength ? rendered : rendered.slice(0, maxLength - 1) + '…'
}

async function writeJson(path: string, value: unknown): Promise<number> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = path + '.' + randomUUID() + '.tmp'
  const content = JSON.stringify(value, null, 2) + '\n'
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
  await rename(temporary, path)
  return (await stat(path)).size
}

export interface ExecutionOutputWriter {
  readonly outputDir: string
  readonly intermediateRoot: string
  initialize(): Promise<void>
  writeNodeInput(nodeId: string, input: JsonValue, inputPorts: JsonObject): Promise<ExecutionArtifact[]>
  writeIntermediate(nodeId: string, label: string, value: JsonValue, portId?: string): Promise<ExecutionArtifact>
  writeNodeRecord(record: NodeExecutionRecord): Promise<ExecutionArtifact[]>
  finalize(execution: WorkflowExecution): Promise<ExecutionArtifact[]>
}

/**
 * Durable, per-execution filesystem layout.
 *
 * <base>/<workflow>/<timestamp>-<execution>/
 *   workflow.json
 *   execution.json
 *   nodes/<node>/{input,output,error,logs}.json
 *   intermediate/<node>/<sequence>-<label>.json
 */
export class FileExecutionOutput implements ExecutionOutputWriter {
  readonly outputDir: string
  readonly intermediateRoot: string
  private readonly artifacts: ExecutionArtifact[] = []
  private readonly sequence = new Map<string, number>()

  constructor(
    baseDir: string,
    private readonly workflow: WorkflowDefinition,
    private readonly execution: WorkflowExecution,
  ) {
    const stamp = (execution.startedAt ?? new Date().toISOString()).replaceAll(/[:.]/g, '-')
    this.outputDir = join(resolve(baseDir), safeSegment(workflow.id), stamp + '-' + safeSegment(execution.id))
    this.intermediateRoot = join(this.outputDir, 'intermediate')
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(join(this.outputDir, 'nodes'), { recursive: true }),
      mkdir(this.intermediateRoot, { recursive: true }),
    ])
    const path = join(this.outputDir, 'workflow.json')
    const bytes = await writeJson(path, this.workflow)
    this.artifacts.push({
      kind: 'manifest',
      label: 'Workflow definition',
      path,
      mediaType: JSON_MEDIA_TYPE,
      bytes,
      preview: this.workflow.nodes.length + ' nodes · ' + this.workflow.edges.length + ' edges',
    })
  }

  async writeNodeInput(nodeId: string, input: JsonValue, inputPorts: JsonObject): Promise<ExecutionArtifact[]> {
    const nodeDir = join(this.outputDir, 'nodes', safeSegment(nodeId))
    const inputPath = join(nodeDir, 'input.json')
    const portsPath = join(nodeDir, 'input-ports.json')
    const [inputBytes, portsBytes] = await Promise.all([
      writeJson(inputPath, input),
      writeJson(portsPath, inputPorts),
    ])
    const written: ExecutionArtifact[] = [
      {
        kind: 'input',
        nodeId,
        label: 'Node input',
        path: inputPath,
        mediaType: JSON_MEDIA_TYPE,
        bytes: inputBytes,
        preview: previewOf(input),
      },
      {
        kind: 'input',
        nodeId,
        label: 'Input ports',
        path: portsPath,
        mediaType: JSON_MEDIA_TYPE,
        bytes: portsBytes,
        preview: previewOf(inputPorts),
      },
    ]
    this.artifacts.push(...written)
    return written
  }

  async writeIntermediate(nodeId: string, label: string, value: JsonValue, portId?: string): Promise<ExecutionArtifact> {
    const next = (this.sequence.get(nodeId) ?? 0) + 1
    this.sequence.set(nodeId, next)
    const path = join(
      this.intermediateRoot,
      safeSegment(nodeId),
      String(next).padStart(3, '0') + '-' + safeSegment(label) + '.json',
    )
    const bytes = await writeJson(path, value)
    const artifact: ExecutionArtifact = {
      kind: 'intermediate',
      nodeId,
      ...(portId === undefined ? {} : { portId }),
      label,
      path,
      mediaType: JSON_MEDIA_TYPE,
      bytes,
      preview: previewOf(value),
    }
    this.artifacts.push(artifact)
    return artifact
  }

  async writeNodeRecord(record: NodeExecutionRecord): Promise<ExecutionArtifact[]> {
    const nodeDir = join(this.outputDir, 'nodes', safeSegment(record.nodeId))
    const written: ExecutionArtifact[] = []
    if (record.output !== undefined) {
      const path = join(nodeDir, 'output.json')
      const bytes = await writeJson(path, {
        value: record.output,
        ports: record.outputPorts ?? {},
      })
      written.push({
        kind: 'output',
        nodeId: record.nodeId,
        label: 'Node output',
        path,
        mediaType: JSON_MEDIA_TYPE,
        bytes,
        preview: previewOf(record.output),
      })
    }
    if (record.logs !== undefined && record.logs.length > 0) {
      const path = join(nodeDir, 'logs.json')
      const bytes = await writeJson(path, record.logs)
      written.push({
        kind: 'logs',
        nodeId: record.nodeId,
        label: 'Node logs',
        path,
        mediaType: JSON_MEDIA_TYPE,
        bytes,
        preview: record.logs.length + ' log entries',
      })
    }
    if (record.error !== undefined) {
      const path = join(nodeDir, 'error.json')
      const bytes = await writeJson(path, {
        nodeId: record.nodeId,
        status: record.status,
        attempts: record.attempts,
        message: record.error,
      })
      written.push({
        kind: 'error',
        nodeId: record.nodeId,
        label: 'Node error',
        path,
        mediaType: JSON_MEDIA_TYPE,
        bytes,
        preview: record.error.slice(0, 240),
      })
    }
    this.artifacts.push(...written)
    return written
  }

  async finalize(execution: WorkflowExecution): Promise<ExecutionArtifact[]> {
    const path = join(this.outputDir, 'execution.json')
    const snapshot: WorkflowExecution = {
      ...execution,
      outputDir: this.outputDir,
      artifacts: [...this.artifacts],
    }
    const bytes = await writeJson(path, snapshot)
    const manifest: ExecutionArtifact = {
      kind: 'manifest',
      label: 'Execution manifest',
      path,
      mediaType: JSON_MEDIA_TYPE,
      bytes,
      preview: execution.status + ' · ' + execution.nodes.length + ' nodes',
    }
    this.artifacts.push(manifest)
    return [...this.artifacts]
  }
}
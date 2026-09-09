import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  watch,
  type FSWatcher,
} from 'node:fs'
import { join } from 'node:path'
import type { WorkflowDefinition, WorkflowExecution } from '../../contracts.ts'
import { writeAtomicJsonSync } from './atomic-json.ts'
import { isExecutionDocument, isWorkflowDocument } from './document-validation.ts'

type Identified = { id: string }
type WarningSink = (message: string) => void

const clone = <T>(value: T): T => structuredClone(value)

function fileStem(id: string): string {
  const readable = id.replaceAll(/[^a-zA-Z0-9._-]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'record'
  const digest = createHash('sha256').update(id).digest('hex').slice(0, 8)
  return readable + '-' + digest
}

class JsonFileRepository<T extends Identified> {
  private readonly records = new Map<string, T>()
  private readonly paths = new Map<string, string>()

  constructor(
    readonly directory: string,
    private readonly suffix: string,
    private readonly validate: (value: unknown) => value is T,
    private readonly warn: WarningSink,
  ) {
    this.reload()
  }

  list(compare: (left: T, right: T) => number): T[] {
    return [...this.records.values()].sort(compare).map(clone)
  }

  get(id: string): T | undefined {
    const value = this.records.get(id)
    return value === undefined ? undefined : clone(value)
  }

  save(value: T): T {
    const stored = clone(value)
    mkdirSync(this.directory, { recursive: true })
    const path = this.paths.get(stored.id) ?? join(this.directory, fileStem(stored.id) + this.suffix)
    writeAtomicJsonSync(path, stored)
    this.records.set(stored.id, stored)
    this.paths.set(stored.id, path)
    return clone(stored)
  }

  delete(id: string): boolean {
    const path = this.paths.get(id)
    if (path !== undefined && existsSync(path)) unlinkSync(path)
    const removed = this.records.delete(id)
    this.paths.delete(id)
    return removed
  }

  reload(): void {
    mkdirSync(this.directory, { recursive: true })
    const nextRecords = new Map<string, T>()
    const nextPaths = new Map<string, string>()
    for (const name of readdirSync(this.directory).filter(item => item.endsWith(this.suffix)).sort()) {
      const path = join(this.directory, name)
      try {
        const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (!this.validate(value)) throw new Error('invalid record shape')
        if (nextRecords.has(value.id)) throw new Error('duplicate record id: ' + value.id)
        nextRecords.set(value.id, clone(value))
        nextPaths.set(value.id, path)
      } catch (error) {
        this.warn('RunFlow ignored invalid file ' + path + ': ' + (error instanceof Error ? error.message : String(error)))
      }
    }
    this.records.clear()
    this.paths.clear()
    for (const [id, value] of nextRecords) this.records.set(id, value)
    for (const [id, path] of nextPaths) this.paths.set(id, path)
  }

  watch(onReload?: () => void): () => void {
    mkdirSync(this.directory, { recursive: true })
    let watcher: FSWatcher | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let reloading = false
    let queued = false
    const drain = (): void => {
      if (reloading) { queued = true; return }
      reloading = true
      do {
        queued = false
        this.reload()
        onReload?.()
      } while (queued)
      reloading = false
    }
    try {
      watcher = watch(this.directory, { persistent: false }, () => {
        if (timer !== undefined) clearTimeout(timer)
        timer = setTimeout(() => { timer = undefined; drain() }, 120)
      })
      watcher.on('error', error => this.warn('RunFlow repository watcher failed: ' + error.message))
    } catch (error) {
      this.warn('RunFlow repository watcher could not start: ' + (error instanceof Error ? error.message : String(error)))
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      watcher?.close()
    }
  }
}

export class FileWorkflowRepository {
  private readonly files: JsonFileRepository<WorkflowDefinition>

  constructor(directory: string, warn: WarningSink = () => undefined) {
    this.files = new JsonFileRepository(directory, '.workflow.json', isWorkflowDocument, warn)
  }

  list(): WorkflowDefinition[] {
    return this.files.list((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))
  }

  get(id: string): WorkflowDefinition | undefined { return this.files.get(id) }
  save(value: WorkflowDefinition): WorkflowDefinition { return this.files.save(value) }
  delete(id: string): boolean { return this.files.delete(id) }
  reload(): void { this.files.reload() }
  watch(onReload?: () => void): () => void { return this.files.watch(onReload) }
}

export class FileExecutionRepository {
  private readonly files: JsonFileRepository<WorkflowExecution>

  constructor(directory: string, warn: WarningSink = () => undefined) {
    this.files = new JsonFileRepository(directory, '.execution.json', isExecutionDocument, warn)
  }

  list(workflowId?: string, limit = 50): WorkflowExecution[] {
    return this.files
      .list((left, right) => (right.startedAt ?? '').localeCompare(left.startedAt ?? ''))
      .filter(value => workflowId === undefined || value.workflowId === workflowId)
      .slice(0, Math.max(0, limit))
  }

  get(id: string): WorkflowExecution | undefined { return this.files.get(id) }
  save(value: WorkflowExecution): WorkflowExecution { return this.files.save(value) }
  delete(id: string): boolean { return this.files.delete(id) }
}

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
import { mkdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  JsonValue,
  NodeExecutionContext,
  WorkflowExecution,
  WorkflowNodeDefinition,
  WorkflowNodeDescriptor,
} from './contracts.ts'
import { writeAtomicJson, writeAtomicJsonSync } from './backend/v2/atomic-json.ts'
import { validateExecutionDescriptor } from './node-execution.ts'

export type NodeLibrarySource = 'builtin' | 'plugin' | 'memory' | 'local'

export interface NodeDraftInput {
  descriptor: WorkflowNodeDescriptor
  program: string
}

export interface PersistedNodeDocument {
  formatVersion: 1
  state?: 'draft' | 'committed'
  descriptor: WorkflowNodeDescriptor
  program: string
  revision: string
  testedRevision?: string
  savedAt: string
}

export interface NodeLibraryEntry {
  descriptor: WorkflowNodeDescriptor
  source: NodeLibrarySource
  revision?: string
  testedRevision?: string
  persisted: boolean
  savedAt?: string
  path?: string
  program?: string
}

export interface NodeTestReceipt {
  type: string
  revision: string
  execution: WorkflowExecution
  passed: boolean
}

interface NodeRecord {
  descriptor: WorkflowNodeDescriptor
  definition: WorkflowNodeDefinition
  source: NodeLibrarySource
  revision?: string
  testedRevision?: string
  savedAt?: string
  path?: string
  program?: string
}

export type ProgramExecutor = (
  program: string,
  descriptor: WorkflowNodeDescriptor,
  context: NodeExecutionContext,
) => Promise<JsonValue>

const TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+$/
const PORT_PATTERN = /^[a-z][a-z0-9_-]*$/

const clone = <T>(value: T): T => structuredClone(value)

function revisionOf(input: NodeDraftInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function validateDraft(input: NodeDraftInput): void {
  const descriptor = input.descriptor
  validateExecutionDescriptor(descriptor)
  if (!TYPE_PATTERN.test(descriptor.type)) {
    throw new Error('node type must be a namespaced lowercase id such as custom.extract-text')
  }
  for (const [name, value] of [
    ['title', descriptor.title],
    ['description', descriptor.description],
    ['color', descriptor.color],
    ['icon', descriptor.icon],
  ] as const) {
    if (value.trim().length === 0) throw new Error('node descriptor.' + name + ' must not be empty')
  }
  if (!['trigger', 'action', 'logic', 'ai', 'data'].includes(descriptor.category)) {
    throw new Error('node descriptor.category is invalid')
  }
  if (descriptor.group !== undefined) {
    const segments = descriptor.group.split('/')
    if (descriptor.group.length > 160
      || segments.length > 8
      || segments.some(segment => segment.trim().length === 0
        || segment !== segment.trim()
        || segment === '.'
        || segment === '..'
        || /[\u0000-\u001F\u007F]/.test(segment)
        || segment.length > 48)) {
      throw new Error('node descriptor.group must be a slash-delimited path with 1-8 non-empty segments')
    }
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(descriptor.color)) {
    throw new Error('node descriptor.color must be a six-digit hex color')
  }
  if (input.program.trim().length === 0) throw new Error('node program must not be empty')
  for (const [direction, ports] of [
    ['input', descriptor.inputs ?? []],
    ['output', descriptor.outputs ?? []],
  ] as const) {
    const seen = new Set<string>()
    for (const port of ports) {
      if (!PORT_PATTERN.test(port.id)) throw new Error(direction + ' port id is invalid: ' + port.id)
      if (seen.has(port.id)) throw new Error('duplicate ' + direction + ' port id: ' + port.id)
      seen.add(port.id)
    }
  }
  JSON.stringify(input)
}

function fileName(type: string): string {
  return type.replaceAll(/[^a-zA-Z0-9._-]+/g, '-') + '.node.json'
}

function descriptorFromDefinition(definition: WorkflowNodeDefinition): WorkflowNodeDescriptor {
  const { execute: _execute, ...descriptor } = definition
  return clone(descriptor)
}

function descriptorOf(record: NodeRecord): WorkflowNodeDescriptor {
  return clone(record.descriptor)
}

export class FlowNodeLibrary {
  private readonly records = new Map<string, NodeRecord>()
  private readonly persistingTypes = new Set<string>()
  readonly nodesDir: string
  readonly draftsDir: string

  constructor(
    nodesDir: string,
    private readonly executeProgram: ProgramExecutor,
    private readonly warn: (message: string) => void = () => {},
  ) {
    this.nodesDir = resolve(nodesDir)
    this.draftsDir = join(this.nodesDir, '.drafts')
    this.loadPersisted()
  }

  registerBuiltin(definition: WorkflowNodeDefinition): void {
    validateExecutionDescriptor(definition)
    const existing = this.records.get(definition.type)
    if (existing?.source === 'local' || existing?.source === 'memory') {
      this.warn('RunFlow ignored local node that collides with builtin ' + definition.type)
      this.records.set(definition.type, { descriptor: descriptorFromDefinition(definition), definition, source: 'builtin' })
      return
    }
    this.registerStable(definition, 'builtin')
  }

  registerPlugin(definition: WorkflowNodeDefinition): () => void {
    this.registerStable(definition, 'plugin')
    return (): void => {
      const current = this.records.get(definition.type)
      if (current?.definition === definition) this.records.delete(definition.type)
    }
  }

  resolve(type: string): WorkflowNodeDefinition | undefined {
    return this.records.get(type)?.definition
  }

  list(): NodeLibraryEntry[] {
    return [...this.records.values()]
      .map(record => this.project(record, false))
      .sort((left, right) => left.descriptor.type.localeCompare(right.descriptor.type))
  }

  get(type: string): NodeLibraryEntry | undefined {
    const record = this.records.get(type)
    return record === undefined ? undefined : this.project(record, true)
  }

  upsertDraft(input: NodeDraftInput): NodeLibraryEntry {
    validateDraft(input)
    const current = this.records.get(input.descriptor.type)
    if (current?.source === 'builtin' || current?.source === 'plugin') {
      throw new Error('cannot replace ' + current.source + ' node provider ' + input.descriptor.type)
    }
    const revision = revisionOf(input)
    const savedAt = new Date().toISOString()
    const record: NodeRecord = {
      descriptor: clone(input.descriptor),
      definition: this.definition(input),
      source: 'memory',
      revision,
      ...(current?.testedRevision === revision ? { testedRevision: revision } : {}),
      savedAt,
      program: input.program,
    }
    this.persistDraft(record)
    this.records.set(input.descriptor.type, record)
    return this.project(record, true)
  }

  removeDraft(type: string): boolean {
    const current = this.records.get(type)
    if (current?.source !== 'memory') return false
    if (current.path !== undefined && existsSync(current.path)) unlinkSync(current.path)
    this.records.delete(type)
    return true
  }

  markTested(type: string, execution: WorkflowExecution, expectedRevision?: string): NodeTestReceipt {
    const record = { ...this.requireMutable(type) }
    if (record.revision === undefined) throw new Error('node draft has no revision')
    if (expectedRevision !== undefined && record.revision !== expectedRevision) {
      throw new Error('node draft revision changed during testing; test the current revision again')
    }
    const passed = execution.status === 'SUCCESS'
    if (passed) record.testedRevision = record.revision
    else delete record.testedRevision
    this.persistDraft(record)
    this.records.set(type, record)
    return { type, revision: record.revision, execution: clone(execution), passed }
  }

  async commit(type: string): Promise<NodeLibraryEntry> {
    const record = this.requireMutable(type)
    if (record.source !== 'memory') throw new Error('only an in-memory node draft can be solidified')
    if (record.revision === undefined || record.program === undefined) throw new Error('node draft is incomplete')
    if (record.testedRevision !== record.revision) {
      throw new Error('node draft must pass an in-memory RunFlow execution test at its current revision before commit')
    }
    this.beginPersistence(type)
    try {
      await mkdir(this.nodesDir, { recursive: true })
      const path = join(this.nodesDir, fileName(type))
      const savedAt = new Date().toISOString()
      const document: PersistedNodeDocument = {
        formatVersion: 1,
        state: 'committed',
        descriptor: descriptorOf(record),
        program: record.program,
        revision: record.revision,
        ...(record.testedRevision === undefined ? {} : { testedRevision: record.testedRevision }),
        savedAt,
      }
      await writeAtomicJson(path, document)
      const committed: NodeRecord = { ...record, source: 'local', path, savedAt }
      // A newer edit may replace this record while the committed file is being written.
      // Publish and remove the draft together only if it is still the tested snapshot.
      if (this.records.get(type) === record) {
        const draftPath = record.path
        if (draftPath !== undefined && draftPath !== path && existsSync(draftPath)) unlinkSync(draftPath)
        this.records.set(type, committed)
      }
      return this.project(committed, true)
    } finally {
      this.persistingTypes.delete(type)
    }
  }

  async removePersisted(type: string): Promise<boolean> {
    const record = this.records.get(type)
    if (record?.source !== 'local' || record.path === undefined) return false
    this.beginPersistence(type)
    try {
      await unlink(record.path)
      if (this.records.get(type) === record) this.records.delete(type)
      return true
    } finally {
      this.persistingTypes.delete(type)
    }
  }

  /** Watch committed and draft JSON providers and hot-reload changes from disk. */
  startWatching(): () => void {
    mkdirSync(this.nodesDir, { recursive: true })
    mkdirSync(this.draftsDir, { recursive: true })
    const watchers: FSWatcher[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        this.reloadPersisted()
      }, 120)
    }
    try {
      watchers.push(watch(this.nodesDir, { recursive: true, persistent: false }, schedule))
    } catch {
      watchers.push(watch(this.nodesDir, { persistent: false }, schedule))
      watchers.push(watch(this.draftsDir, { persistent: false }, schedule))
    }
    for (const watcher of watchers) watcher.on('error', error => this.warn('RunFlow node watcher failed: ' + String(error)))
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      for (const watcher of watchers) watcher.close()
    }
  }

  private registerStable(definition: WorkflowNodeDefinition, source: 'builtin' | 'plugin'): void {
    validateExecutionDescriptor(definition)
    if (this.records.has(definition.type)) throw new Error('flow: duplicate node provider ' + definition.type)
    this.records.set(definition.type, { descriptor: descriptorFromDefinition(definition), definition, source })
  }

  private beginPersistence(type: string): void {
    if (this.persistingTypes.has(type)) throw new Error('node commit or removal is already in progress: ' + type)
    this.persistingTypes.add(type)
  }

  private definition(input: NodeDraftInput): WorkflowNodeDefinition {
    const descriptor = clone(input.descriptor)
    const program = input.program
    return {
      ...descriptor,
      available: true,
      execute: context => this.executeProgram(program, descriptor, context),
    }
  }

  private requireMutable(type: string): NodeRecord {
    const record = this.records.get(type)
    if (record === undefined) throw new Error('node is unknown: ' + type)
    if (record.source === 'builtin' || record.source === 'plugin') {
      throw new Error('node is not mutable: ' + type)
    }
    return record
  }

  private project(record: NodeRecord, includeProgram: boolean): NodeLibraryEntry {
    return {
      descriptor: descriptorOf(record),
      source: record.source,
      ...(record.revision === undefined ? {} : { revision: record.revision }),
      ...(record.testedRevision === undefined ? {} : { testedRevision: record.testedRevision }),
      persisted: record.source === 'local',
      ...(record.savedAt === undefined ? {} : { savedAt: record.savedAt }),
      ...(record.path === undefined ? {} : { path: record.path }),
      ...(includeProgram && record.program !== undefined ? { program: record.program } : {}),
    }
  }

  private persistDraft(record: NodeRecord): void {
    if (record.revision === undefined || record.program === undefined) throw new Error('node draft is incomplete')
    mkdirSync(this.draftsDir, { recursive: true })
    const path = join(this.draftsDir, fileName(record.descriptor.type))
    const savedAt = new Date().toISOString()
    const document: PersistedNodeDocument = {
      formatVersion: 1,
      state: 'draft',
      descriptor: descriptorOf(record),
      program: record.program,
      revision: record.revision,
      ...(record.testedRevision === undefined ? {} : { testedRevision: record.testedRevision }),
      savedAt,
    }
    writeAtomicJsonSync(path, document)
    record.path = path
    record.savedAt = savedAt
  }

  private readDocument(path: string): NodeRecord {
    const document = JSON.parse(readFileSync(path, 'utf8')) as PersistedNodeDocument
    if (document.formatVersion !== 1) throw new Error('unsupported formatVersion')
    const input = { descriptor: document.descriptor, program: document.program }
    validateDraft(input)
    const revision = revisionOf(input)
    if (revision !== document.revision) throw new Error('revision does not match descriptor and program')
    const draft = document.state === 'draft' || path.startsWith(this.draftsDir)
    return {
      descriptor: clone(document.descriptor),
      definition: this.definition(input),
      source: draft ? 'memory' : 'local',
      revision,
      ...(document.testedRevision === revision ? { testedRevision: revision } : {}),
      savedAt: document.savedAt,
      path,
      program: document.program,
    }
  }

  private reloadPersisted(): void {
    mkdirSync(this.nodesDir, { recursive: true })
    mkdirSync(this.draftsDir, { recursive: true })
    const disk = new Map<string, NodeRecord>()
    const groups = [
      readdirSync(this.nodesDir).filter(item => item.endsWith('.node.json')).sort().map(name => join(this.nodesDir, name)),
      readdirSync(this.draftsDir).filter(item => item.endsWith('.node.json')).sort().map(name => join(this.draftsDir, name)),
    ]
    for (const path of groups.flat()) {
      try {
        const record = this.readDocument(path)
        disk.set(record.descriptor.type, record)
      } catch (error) {
        this.warn('RunFlow ignored invalid node library file ' + path + ': '
          + (error instanceof Error ? error.message : String(error)))
      }
    }
    for (const [type, record] of [...this.records]) {
      if (record.source !== 'local' && record.source !== 'memory') continue
      const loaded = disk.get(type)
      // Reloads of the same durable snapshot must not invalidate an in-flight
      // commit/removal. A new revision or changed metadata still replaces it.
      if (loaded !== undefined
        && loaded.source === record.source
        && loaded.revision === record.revision
        && loaded.testedRevision === record.testedRevision
        && loaded.path === record.path
        && loaded.savedAt === record.savedAt) {
        disk.set(type, record)
      }
      this.records.delete(type)
    }
    for (const [type, record] of disk) {
      const stable = this.records.get(type)
      if (stable !== undefined) {
        this.warn('RunFlow ignored local node that collides with ' + stable.source + ' ' + type)
        continue
      }
      this.records.set(type, record)
    }
  }

  private loadPersisted(): void {
    this.reloadPersisted()
  }
}

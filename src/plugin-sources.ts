import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

export type RunFlowPluginSourceKind = 'node' | 'script'

export interface RunFlowPluginSource {
  kind: RunFlowPluginSourceKind
  name: string
  content: string
  version: string
  bytes: number
  updatedAt: string
}

export interface SaveRunFlowPluginSourceRequest {
  kind: RunFlowPluginSourceKind
  name: string
  content: string
}

const MAX_SOURCE_BYTES = 512 * 1024
const SOURCE_NAME = /^[a-z0-9][a-z0-9._-]*\.(node|script)\.(ts|mts|js|mjs)$/i

function expectedMarker(kind: RunFlowPluginSourceKind): string {
  return kind === 'node' ? '.node.' : '.script.'
}

function assertName(kind: RunFlowPluginSourceKind, name: string): void {
  if (basename(name) !== name || !SOURCE_NAME.test(name) || !name.includes(expectedMarker(kind))) {
    throw new Error(kind + ' source name must be a plain *' + expectedMarker(kind) + '{ts,mts,js,mjs} filename')
  }
}

function versionOf(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

/** Constrained source library for trusted, creation-mode Cordis plugins. */
export class RunFlowPluginSourceLibrary {
  constructor(
    readonly nodesDir: string,
    readonly scriptsDir: string,
  ) {
    mkdirSync(nodesDir, { recursive: true })
    mkdirSync(scriptsDir, { recursive: true })
  }

  list(): RunFlowPluginSource[] {
    return [
      ...this.listDirectory('node', this.nodesDir),
      ...this.listDirectory('script', this.scriptsDir),
    ].sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name))
  }

  save(request: SaveRunFlowPluginSourceRequest): RunFlowPluginSource {
    assertName(request.kind, request.name)
    const bytes = Buffer.byteLength(request.content)
    if (bytes === 0) throw new Error('plugin source cannot be empty')
    if (bytes > MAX_SOURCE_BYTES) throw new Error('plugin source exceeds 512 KiB')
    const directory = request.kind === 'node' ? this.nodesDir : this.scriptsDir
    const path = resolve(directory, request.name)
    if (resolve(path) !== resolve(directory, request.name)) throw new Error('plugin source path escaped its library')
    // The loader fingerprints full content and serializes scans, so a direct
    // write is safe on Windows and avoids the non-portable replace-rename edge.
    writeFileSync(path, request.content, 'utf8')
    return this.read(request.kind, directory, request.name)
  }

  private listDirectory(kind: RunFlowPluginSourceKind, directory: string): RunFlowPluginSource[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      if (!entry.isFile() || !entry.name.includes(expectedMarker(kind))) return []
      try {
        assertName(kind, entry.name)
        return [this.read(kind, directory, entry.name)]
      } catch {
        return []
      }
    })
  }

  private read(kind: RunFlowPluginSourceKind, directory: string, name: string): RunFlowPluginSource {
    const path = resolve(directory, name)
    const content = readFileSync(path, 'utf8')
    const stats = statSync(path)
    return {
      kind,
      name,
      content,
      version: versionOf(content),
      bytes: Buffer.byteLength(content),
      updatedAt: stats.mtime.toISOString(),
    }
  }
}

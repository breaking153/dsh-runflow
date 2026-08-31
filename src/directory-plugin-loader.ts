import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, watch, type FSWatcher } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context, Plugin } from '@deepseek-ai/cordis'

interface LoadedPlugin {
  plugin: Plugin
  fiber: { dispose(): Promise<void> }
  version: string
}

export interface DirectoryPluginLoaderOptions {
  directory: string
  suffixes: readonly string[]
  label: string
  watch?: boolean
}

const messageOf = (error: unknown): string => error instanceof Error ? error.stack ?? error.message : String(error)

/** Hot-load trusted local Cordis child plugins from a constrained directory. */
export class DirectoryPluginLoader {
  readonly directory: string
  private readonly loaded = new Map<string, LoadedPlugin>()
  private watcher: FSWatcher | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private scanRequested = false
  private scanTask: Promise<void> | undefined
  private disposed = false

  constructor(private readonly ctx: Context, private readonly options: DirectoryPluginLoaderOptions) {
    this.directory = resolve(options.directory)
  }

  async start(): Promise<void> {
    this.disposed = false
    mkdirSync(this.directory, { recursive: true })
    if (this.options.watch === false) {
      await this.scan()
      return
    }
    try {
      this.watcher = watch(this.directory, { recursive: true, persistent: false }, () => this.schedule())
    } catch {
      this.watcher = watch(this.directory, { persistent: false }, () => this.schedule())
    }
    this.watcher.on('error', error => this.ctx.logger.warn('%s watcher failed: %s', this.options.label, messageOf(error)))
    try {
      await this.scan()
    } catch (error) {
      this.watcher.close()
      this.watcher = undefined
      throw error
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.watcher?.close()
    this.watcher = undefined
    try {
      await this.scanTask
    } finally {
      const records = [...this.loaded.values()]
      this.loaded.clear()
      await Promise.all(records.map(record => record.fiber.dispose()))
    }
  }

  scan(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.scanRequested = true
    if (this.scanTask === undefined) this.scanTask = this.drainScans()
    return this.scanTask
  }

  /**
   * Like tsc --watch, collapse file events into one invalidation flag and keep
   * exactly one build loop in flight. An event received during a scan causes
   * one more scan after the current commit, never a competing commit.
   */
  private async drainScans(): Promise<void> {
    try {
      do {
        this.scanRequested = false
        await this.scanOnce()
      } while (this.scanRequested && !this.disposed)
    } finally {
      this.scanTask = undefined
    }
  }

  private async scanOnce(): Promise<void> {
    const files = await this.files(this.directory)
    const live = new Set(files)
    for (const path of [...this.loaded.keys()]) {
      if (live.has(path)) continue
      await this.loaded.get(path)?.fiber.dispose()
      this.loaded.delete(path)
      this.ctx.logger.info('%s unloaded %s', this.options.label, path)
    }
    for (const path of files) await this.load(path)
  }

  private schedule(): void {
    if (this.disposed) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.scan().catch(error => this.ctx.logger.warn('%s reload failed: %s', this.options.label, messageOf(error)))
    }, 140)
  }

  private async files(directory: string): Promise<string[]> {
    if (!existsSync(directory)) return []
    const found: string[] = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')) found.push(...await this.files(path))
      else if (this.options.suffixes.some(suffix => entry.name.endsWith(suffix))) found.push(path)
    }
    return found.sort()
  }

  private async load(path: string): Promise<void> {
    const version = await this.contentVersion(path)
    if (version === undefined) {
      this.scanRequested = true
      return
    }
    const previous = this.loaded.get(path)
    if (previous?.version === version) return
    let plugin: Plugin
    try {
      const namespace = await import(pathToFileURL(path).href + '?runflow=' + encodeURIComponent(version)) as Record<string, unknown>
      plugin = (namespace['default'] ?? namespace) as Plugin
      if (this.ctx.registry.resolve(plugin) === undefined) throw new Error('module must export a Cordis plugin or named apply(ctx)')
    } catch (error) {
      if (await this.changedSince(path, version)) {
        this.scanRequested = true
        return
      }
      this.ctx.logger.warn('%s could not import %s: %s', this.options.label, path, messageOf(error))
      return
    }
    if (await this.changedSince(path, version)) {
      this.scanRequested = true
      return
    }
    if (this.disposed) return
    if (previous !== undefined) await previous.fiber.dispose()
    try {
      const fiber = this.ctx.plugin(plugin)
      await fiber
      this.loaded.set(path, { plugin, fiber, version })
      this.ctx.logger.info('%s loaded %s', this.options.label, path)
      if (await this.changedSince(path, version)) this.scanRequested = true
    } catch (error) {
      this.ctx.logger.warn('%s could not activate %s: %s', this.options.label, path, messageOf(error))
      if (previous !== undefined) {
        try {
          const fiber = this.ctx.plugin(previous.plugin)
          await fiber
          this.loaded.set(path, { ...previous, fiber })
        } catch (restoreError) {
          this.loaded.delete(path)
          this.ctx.logger.warn('%s could not restore %s: %s', this.options.label, path, messageOf(restoreError))
        }
      }
      if (await this.changedSince(path, version)) this.scanRequested = true
    }
  }

  private async changedSince(path: string, version: string): Promise<boolean> {
    try {
      return await this.contentVersion(path) !== version
    } catch (error) {
      this.ctx.logger.warn('%s could not fingerprint %s: %s', this.options.label, path, messageOf(error))
      return false
    }
  }

  private async contentVersion(path: string): Promise<string | undefined> {
    try {
      const content = await readFile(path)
      return createHash('sha256').update(content).digest('hex')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
}

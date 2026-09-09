export type BrowserStorageKind = 'local' | 'session'

function storage(kind: BrowserStorageKind): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  // Accessing the property itself can throw when storage is blocked.
  return kind === 'local' ? window.localStorage : window.sessionStorage
}

export function readBrowserStorage(key: string, kind: BrowserStorageKind = 'local'): string | null {
  try { return storage(kind)?.getItem(key) ?? null } catch { return null }
}

/** Preferences and caches are optional; callers decide whether a failed write is durable-data loss. */
export function writeBrowserStorage(key: string, value: string, kind: BrowserStorageKind = 'local'): boolean {
  try {
    const target = storage(kind)
    if (target === undefined) return false
    target.setItem(key, value)
    return true
  } catch { return false }
}

export function removeBrowserStorage(key: string, kind: BrowserStorageKind = 'local'): void {
  try { storage(kind)?.removeItem(key) } catch { /* Browser preferences must not block the editor. */ }
}

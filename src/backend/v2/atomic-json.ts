import { randomUUID } from 'node:crypto'
import { renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { rename, unlink, writeFile } from 'node:fs/promises'

/** Replace within the same directory, leaving the previous document intact on failure. */
export function writeAtomicJsonSync(path: string, value: unknown): void {
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    renameSync(temporary, path)
  } catch (error) {
    // Cleanup must not hide the original persistence failure.
    try { unlinkSync(temporary) } catch {}
    throw error
  }
}

export async function writeAtomicJson(path: string, value: unknown): Promise<void> {
  const temporary = path + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } catch (error) {
    try { await unlink(temporary) } catch {}
    throw error
  }
}

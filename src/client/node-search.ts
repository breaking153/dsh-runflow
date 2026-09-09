import type { NodeCategory, WorkflowNodeDescriptor } from '../contracts.ts'
import { readBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'

export type NodeSearchScope = 'all' | 'recent' | 'favorites' | NodeCategory

function score(descriptor: WorkflowNodeDescriptor, terms: string[]): number {
  const title = descriptor.title.toLowerCase()
  const type = descriptor.type.toLowerCase()
  const description = descriptor.description.toLowerCase()
  let total = 0
  for (const term of terms) {
    if (title === term) total += 120
    else if (title.startsWith(term)) total += 90
    else if (title.includes(term)) total += 60
    if (type.startsWith(term)) total += 42
    else if (type.includes(term)) total += 30
    if (description.includes(term)) total += 14
    if (!title.includes(term) && !type.includes(term) && !description.includes(term)) return -1
  }
  return total
}

export function rankNodeDescriptors(catalog: WorkflowNodeDescriptor[], query: string): WorkflowNodeDescriptor[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...catalog]
  return catalog.map((descriptor, index) => ({ descriptor, index, score: score(descriptor, terms) }))
    .filter(item => item.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.descriptor)
}

const RECENT_KEY = 'dsh-runflow:recent-nodes'
const FAVORITES_KEY = 'dsh-runflow:favorite-nodes'

function storedIds(key: string): string[] {
  try {
    const value = JSON.parse(readBrowserStorage(key) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch { return [] }
}

export function recentNodeTypes(): string[] { return storedIds(RECENT_KEY) }
export function favoriteNodeTypes(): string[] { return storedIds(FAVORITES_KEY) }
export function rememberNodeType(type: string): void {
  writeBrowserStorage(RECENT_KEY, JSON.stringify([type, ...recentNodeTypes().filter(item => item !== type)].slice(0, 12)))
}
export function toggleFavoriteNodeType(type: string): string[] {
  const current = favoriteNodeTypes()
  const next = current.includes(type) ? current.filter(item => item !== type) : [type, ...current]
  writeBrowserStorage(FAVORITES_KEY, JSON.stringify(next))
  return next
}

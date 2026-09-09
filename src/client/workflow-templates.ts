import type { GraphFragment } from './graph-editing.ts'
import { readBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'

export interface WorkflowFragmentTemplate {
  id: string
  name: string
  description: string
  createdAt: string
  fragment: GraphFragment
}

const TEMPLATE_KEY = 'dsh-runflow:graph-templates'

export function loadWorkflowTemplates(): WorkflowFragmentTemplate[] {
  try {
    const value = JSON.parse(readBrowserStorage(TEMPLATE_KEY) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is WorkflowFragmentTemplate => typeof item === 'object' && item !== null
      && typeof (item as WorkflowFragmentTemplate).id === 'string'
      && Array.isArray((item as WorkflowFragmentTemplate).fragment?.nodes)
      && Array.isArray((item as WorkflowFragmentTemplate).fragment?.edges))
  } catch { return [] }
}

export function persistWorkflowTemplates(templates: WorkflowFragmentTemplate[]): void {
  if (!writeBrowserStorage(TEMPLATE_KEY, JSON.stringify(templates))) throw new Error('Template storage is unavailable')
}

export function makeWorkflowTemplate(name: string, fragment: GraphFragment, description = ''): WorkflowFragmentTemplate {
  return {
    id: 'template-' + crypto.randomUUID(),
    name: name.trim() || 'Untitled template',
    description: description.trim(),
    createdAt: new Date().toISOString(),
    fragment: structuredClone(fragment),
  }
}

import type { NodeCategory, WorkflowNodeDescriptor } from '../contracts.ts'

export interface NodeGroupTreeItem {
  id: string
  name: string
  path: string[]
  nodes: WorkflowNodeDescriptor[]
  children: NodeGroupTreeItem[]
}

const CATEGORY_PATHS: Record<NodeCategory, readonly string[]> = {
  trigger: ['Triggers'],
  action: ['Core', 'Actions'],
  logic: ['Core', 'Logic'],
  ai: ['DSH', 'Agents'],
  data: ['Data'],
}

export function nodeGroupPath(descriptor: WorkflowNodeDescriptor): string[] {
  if (descriptor.group === undefined) return [...CATEGORY_PATHS[descriptor.category]]
  const segments = descriptor.group.split('/').map(segment => segment.trim()).filter(Boolean)
  return segments.length === 0 ? [...CATEGORY_PATHS[descriptor.category]] : segments
}

export function nodeGroupLabel(descriptor: WorkflowNodeDescriptor): string {
  return nodeGroupPath(descriptor).join(' / ')
}

type MutableGroup = {
  name: string
  path: string[]
  nodes: WorkflowNodeDescriptor[]
  children: Map<string, MutableGroup>
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function project(group: MutableGroup): NodeGroupTreeItem {
  return {
    id: group.path.join('/'),
    name: group.name,
    path: group.path,
    nodes: [...group.nodes].sort((left, right) => compareText(left.title, right.title) || compareText(left.type, right.type)),
    children: [...group.children.values()].sort((left, right) => compareText(left.name, right.name)).map(project),
  }
}

export function buildNodeGroupTree(descriptors: readonly WorkflowNodeDescriptor[]): NodeGroupTreeItem[] {
  const roots = new Map<string, MutableGroup>()
  for (const descriptor of descriptors) {
    const path = nodeGroupPath(descriptor)
    let siblings = roots
    let group: MutableGroup | undefined
    path.forEach((name, index) => {
      group = siblings.get(name)
      if (group === undefined) {
        group = { name, path: path.slice(0, index + 1), nodes: [], children: new Map() }
        siblings.set(name, group)
      }
      siblings = group.children
    })
    group?.nodes.push(descriptor)
  }
  return [...roots.values()].sort((left, right) => compareText(left.name, right.name)).map(project)
}

import { describe, expect, it } from 'vitest'
import type { WorkflowNodeDescriptor } from '../src/contracts.ts'
import { buildNodeGroupTree, nodeGroupLabel, nodeGroupPath } from '../src/client/node-groups.ts'

function descriptor(type: string, category: WorkflowNodeDescriptor['category'], group?: string): WorkflowNodeDescriptor {
  return {
    type,
    title: type,
    description: type,
    category,
    ...(group === undefined ? {} : { group }),
    color: '#2563EB',
    icon: 'braces',
  }
}

describe('ComfyUI-style node groups', () => {
  it('uses provider-defined slash paths and stable legacy fallbacks', () => {
    expect(nodeGroupPath(descriptor('acme.caption', 'ai', 'Acme Tools/Images'))).toEqual(['Acme Tools', 'Images'])
    expect(nodeGroupPath(descriptor('dsh.agent', 'ai'))).toEqual(['DSH', 'Agents'])
    expect(nodeGroupPath(descriptor('trigger.manual', 'trigger'))).toEqual(['Triggers'])
    expect(nodeGroupLabel(descriptor('acme.caption', 'ai', 'Acme Tools/Images'))).toBe('Acme Tools / Images')
  })

  it('builds a deterministic nested tree and keeps nodes at intermediate groups', () => {
    const tree = buildNodeGroupTree([
      descriptor('z.deep', 'data', 'Acme Tools/Images/Analysis'),
      descriptor('a.images', 'data', 'Acme Tools/Images'),
      descriptor('b.agent', 'ai', 'DSH/Agents'),
    ])
    expect(tree.map(item => item.name)).toEqual(['Acme Tools', 'DSH'])
    expect(tree[0]?.children[0]).toEqual(expect.objectContaining({
      name: 'Images',
      nodes: [expect.objectContaining({ type: 'a.images' })],
    }))
    expect(tree[0]?.children[0]?.children[0]?.nodes[0]?.type).toBe('z.deep')
  })
})

import { describe, expect, it } from 'vitest'
import { controlNodeDefinitions } from '../nodes/control-nodes.ts'
import { controlNodeDescriptors } from '../src/control-node-catalog.ts'
import { NODE_CATALOG } from '../src/client/catalog.tsx'

describe('shared control node port catalog', () => {
  it('keeps the fallback editor and Host descriptors identical', () => {
    for (const { execute: _execute, ...descriptor } of controlNodeDefinitions()) {
      expect(NODE_CATALOG.find(node => node.type === descriptor.type)).toEqual(descriptor)
    }
  })

  it('isolates execution ports from optional data inputs', () => {
    for (const descriptor of controlNodeDescriptors()) {
      expect(descriptor.inputs?.find(port => port.id === 'input')).toMatchObject({ type: 'flow', multiple: true })
      expect(descriptor.outputs?.every(port => port.type === (['state.read', 'control.end'].includes(descriptor.type) ? 'json' : 'flow'))).toBe(true)
      if (['control.join', 'state.read'].includes(descriptor.type)) expect(descriptor.inputs).toHaveLength(1)
      else expect(descriptor.inputs?.find(port => port.id === 'data')).toMatchObject({ type: 'any' })
    }
  })

  it('does not let one catalog consumer mutate another consumer', () => {
    const first = controlNodeDescriptors()
    first[0]!.inputs![0]!.type = 'any'
    first[0]!.configSchema!.type = 'changed'
    expect(controlNodeDescriptors()[0]!.inputs![0]!.type).toBe('flow')
    expect(controlNodeDescriptors()[0]!.configSchema!.type).toBe('object')
  })
})

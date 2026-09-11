import { describe, expect, it } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import { NODE_CATALOG } from '../src/client/catalog.tsx'

const ports = (items: typeof NODE_CATALOG[number]['inputs']) => items?.map(({ id, type }) => ({ id, type }))
describe('Blueprint fallback provider catalog', () => {
  it('offers the same scheduler kind, completion and stable port bindings as the Host', () => {
    for (const node of builtinNodeDefinitions(async () => null)) {
      const fallback = NODE_CATALOG.find(candidate => candidate.type === node.type)
      expect(fallback, node.type).toBeDefined()
      expect(fallback?.executionKind, node.type).toBe(node.executionKind)
      expect(fallback?.completionPort, node.type).toBe(node.completionPort)
      expect(ports(fallback?.inputs), node.type).toEqual(ports(node.inputs))
      expect(ports(fallback?.outputs), node.type).toEqual(ports(node.outputs))
    }
  })
})

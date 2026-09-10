// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { validateNodeConnection } from '../src/client/connection-planning.ts'
const nodes = [
  { id: 'a', data: { inputs: [{ id: 'in', type: 'number' as const }], outputs: [{ id: 'out', type: 'number' as const }] } },
  { id: 'b', data: { inputs: [{ id: 'in', type: 'number' as const }], outputs: [{ id: 'out', type: 'text' as const }] } },
  { id: 'c', data: { inputs: [{ id: 'in', type: 'flow' as const }], outputs: [{ id: 'out', type: 'number' as const }] } },
]
const edge = { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' }
describe('immediate connection diagnostics', () => {
  it('explains type mismatches and refuses flow/data mixing', () => {
    expect(validateNodeConnection(nodes, { ...edge, target: 'c' })).toMatchObject({ ok: false, reason: 'type-mismatch', sourceType: 'number', targetType: 'flow' })
  })
  it('reports duplicate, occupied single input, cycle, and wrong direction separately', () => {
    expect(validateNodeConnection(nodes, edge, { mode: 'dag', edges: [edge] })).toMatchObject({ ok: false, reason: 'duplicate' })
    expect(validateNodeConnection(nodes, { ...edge, source: 'c' }, { mode: 'dag', edges: [edge] })).toMatchObject({ ok: false, reason: 'input-occupied' })
    expect(validateNodeConnection(nodes, edge, { mode: 'dag', edges: [{ source: 'b', target: 'a' }] })).toMatchObject({ ok: false, reason: 'cycle' })
    expect(validateNodeConnection(nodes, { ...edge, targetHandle: 'out' })).toMatchObject({ ok: false, reason: 'same-direction' })
  })
  it('normalizes a valid drag from input to output and allows repeated state-graph input activations', () => {
    expect(validateNodeConnection(nodes, { source: 'b', sourceHandle: 'in', target: 'a', targetHandle: 'out' })).toMatchObject({ ok: true, connection: edge })
    expect(validateNodeConnection(nodes, { ...edge, source: 'c' }, { mode: 'state-graph', edges: [edge] })).toMatchObject({ ok: true })
  })
})

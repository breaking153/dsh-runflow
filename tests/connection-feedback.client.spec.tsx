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
  it('rejects repeated sources for a promoted scalar property in state graph mode', () => {
    const promoted = [...nodes.slice(0, 1), { ...nodes[1]!, data: { ...nodes[1]!.data, inputs: [{ id: 'in', type: 'number' as const, configKey: 'durationMs' }] } }, nodes[2]!]
    expect(validateNodeConnection(promoted, { ...edge, source: 'c' }, { mode: 'state-graph', edges: [edge] })).toMatchObject({ ok: false, reason: 'input-occupied' })
  })
  it('keeps Blueprint data scalar even in state graph mode while preserving legacy aggregation', () => {
    const candidate = { ...edge, source: 'c' }
    expect(validateNodeConnection(nodes, candidate, { mode: 'state-graph', semantics: 'blueprint', edges: [edge] })).toMatchObject({ ok: false, reason: 'input-occupied' })
    expect(validateNodeConnection(nodes, candidate, { mode: 'state-graph', edges: [edge] })).toMatchObject({ ok: true })
    const multiple = nodes.map(node => node.id === 'b' ? { ...node, data: { ...node.data, inputs: [{ id: 'in', type: 'number' as const, multiple: true }] } } : node)
    expect(validateNodeConnection(multiple, candidate, { mode: 'state-graph', semantics: 'blueprint', edges: [edge] })).toMatchObject({ ok: true })
  })
  it('accepts distinct Blueprint flow sources without data aggregation metadata and still rejects duplicate wires', () => {
    const flowNodes = ['a', 'b', 'c'].map(id => ({ id, data: { inputs: [{ id: 'in', type: 'flow' as const }], outputs: [{ id: 'out', type: 'flow' as const }] } }))
    expect(validateNodeConnection(flowNodes, { ...edge, source: 'c' }, { mode: 'dag', semantics: 'blueprint', edges: [edge] })).toMatchObject({ ok: true })
    expect(validateNodeConnection(flowNodes, { ...edge, source: 'c' }, { mode: 'dag', edges: [edge] })).toMatchObject({ ok: false, reason: 'input-occupied' })
    expect(validateNodeConnection(flowNodes, { ...edge, source: 'c' }, { mode: 'state-graph', edges: [edge] })).toMatchObject({ ok: true })
    expect(validateNodeConnection(flowNodes, { ...edge, source: 'c' }, { mode: 'state-graph', semantics: 'blueprint', edges: [edge] })).toMatchObject({ ok: true })
    const multiple = flowNodes.map(node => node.id === 'b' ? { ...node, data: { ...node.data, inputs: [{ id: 'in', type: 'flow' as const, multiple: true }] } } : node)
    expect(validateNodeConnection(multiple, { ...edge, source: 'c' }, { mode: 'dag', edges: [edge] })).toMatchObject({ ok: true })
    expect(validateNodeConnection(flowNodes, edge, { mode: 'dag', semantics: 'blueprint', edges: [edge] })).toMatchObject({ ok: false, reason: 'duplicate' })
  })
})

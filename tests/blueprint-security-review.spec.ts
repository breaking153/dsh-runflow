import { describe, expect, it } from 'vitest'
import type { WorkflowDefinition, WorkflowNodeDefinition, WorkflowNodeDescriptor } from '../src/contracts.ts'
import { validateWorkflow } from '../src/engine.ts'
import { configurableProperties, resolveNodeConfig } from '../src/node-properties.ts'

describe('independent Blueprint security review', () => {
  it('accepts legacy DAG flow reuse while retaining scalar data cardinality validation', () => {
    const provider: WorkflowNodeDefinition = {
      type: 'custom.effect', title: 'Effect', description: 'Effect', category: 'action', icon: 'test', color: '#123456',
      inputs: [{ id: 'input', type: 'flow' }], outputs: [{ id: 'output', type: 'flow' }],
      execute: async ({ input }) => input,
    }
    const definition: WorkflowDefinition = {
      id: 'legacy', name: 'Legacy', version: 1,
      nodes: ['left', 'right', 'sink'].map(id => ({ id, type: provider.type, config: {} })),
      edges: [{ from: 'left', to: 'sink' }, { from: 'right', to: 'sink' }],
    }
    expect(validateWorkflow(definition, () => provider)).toEqual([])
    const dataProvider: WorkflowNodeDefinition = { ...provider, inputs: [{ id: 'input', type: 'json' }], outputs: [{ id: 'output', type: 'json' }] }
    expect(validateWorkflow(definition, () => dataProvider)).toContainEqual(expect.objectContaining({ code: 'PORT_CARDINALITY' }))
  })

  it('does not let parent promotion replace a nested read-only setting', () => {
    const descriptor: WorkflowNodeDescriptor = {
      type: 'custom.request', title: 'Request', description: 'Request', category: 'action', icon: 'test', color: '#123456',
      configSchema: { properties: { options: { type: 'object', properties: {
        endpoint: { type: 'string' }, locked: { type: 'string', readOnly: true },
      } } } },
    }
    expect(configurableProperties(descriptor).map(property => property.key)).not.toContain('options.locked')
    const original = { id: 'request', type: 'custom.request', config: { options: { endpoint: 'saved', locked: 'host-value' } }, promotedInputs: ['options'] }
    const invoke = () => resolveNodeConfig(original, descriptor, { 'property-options': { endpoint: 'dynamic', locked: 'replaced' } })
    let resolved
    try { resolved = invoke() } catch { return }
    expect(resolved.config.options.locked).toBe('host-value')
  })
})

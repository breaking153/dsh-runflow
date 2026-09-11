import type { WorkflowNodeDescriptor } from './contracts.ts'

/** Pure typed values share their property declarations with the editor. */
export function valueNodeDescriptors(): WorkflowNodeDescriptor[] {
  return [
    { type: 'value.text', title: 'Text Value', portType: 'text' as const, schema: { type: 'string', default: '' }, icon: 'text' },
    { type: 'value.number', title: 'Number Value', portType: 'number' as const, schema: { type: 'number', default: 0 }, icon: 'sigma' },
    { type: 'value.boolean', title: 'Boolean Value', portType: 'boolean' as const, schema: { type: 'boolean', default: false }, icon: 'git-branch' },
    { type: 'value.json', title: 'JSON Value', portType: 'json' as const, schema: { default: null }, icon: 'braces' },
  ].map(({ type, title, portType, schema, icon }) => ({
    type, title, description: 'Supply a configured value when a connected node needs it.',
    category: 'data', group: 'Core/Values', color: '#38bdf8', icon, executionKind: 'pure',
    inputs: [], outputs: [{ id: 'value', label: 'value', type: portType }],
    configSchema: { type: 'object', properties: { value: { title: 'Value', ...schema } } },
  }))
}

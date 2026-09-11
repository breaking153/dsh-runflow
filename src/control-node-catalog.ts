import type { JsonObject, WorkflowNodeDescriptor, WorkflowPortDescriptor } from './contracts.ts'

const flowInput: WorkflowPortDescriptor = { id: 'input', label: 'flow', type: 'flow', multiple: true }
const dataInput: WorkflowPortDescriptor = {
  id: 'data', label: 'data', type: 'any',
  description: 'Optional data entry. Uses the supplied value without unwrapping it.',
}
const flowPorts = (...ids: string[]): WorkflowPortDescriptor[] => ids.map(id => ({ id, label: id, type: 'flow' }))
const jsonOutput: WorkflowPortDescriptor[] = [{ id: 'output', label: 'json', type: 'json' }]
const base = {
  category: 'logic' as const, group: 'Core/State Graph', color: '#a78bfa', icon: 'git-branch',
  executionKind: 'effect' as const,
  inputs: [flowInput, dataInput], outputs: flowPorts('output'),
}
const comparisonSchema: JsonObject = {
  type: 'object', properties: {
    source: { type: 'string', enum: ['input', 'state'], default: 'input' },
    path: { type: 'string', default: '' },
    operator: { type: 'string', enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'exists', 'truthy'], default: 'equals' },
    value: {},
  },
}

/** Shared Host/editor metadata. Each consumer receives its own mutable descriptor copy. */
export function controlNodeDescriptors(): WorkflowNodeDescriptor[] {
  return structuredClone([
    {
      ...base, type: 'control.branch', title: 'Branch',
      description: 'Activate exactly one true or false branch using input or shared state.',
      outputs: flowPorts('true', 'false'), configSchema: comparisonSchema,
    },
    {
      ...base, type: 'control.switch', title: 'Route by Rules', icon: 'split',
      description: 'Select the first of four rules, or the default branch.',
      outputs: flowPorts('case1', 'case2', 'case3', 'case4', 'default'),
      configSchema: { type: 'object', properties: { source: { type: 'string', enum: ['input', 'state'], default: 'input' }, rules: { type: 'array', maxItems: 4, items: comparisonSchema } } },
    },
    {
      ...base, type: 'control.parallel', title: 'Parallel Branches', icon: 'workflow',
      description: 'Activate two to four independent branches in the next step.',
      outputs: flowPorts('branch1', 'branch2', 'branch3', 'branch4'),
      configSchema: { type: 'object', properties: { branchCount: { type: 'integer', minimum: 1, maximum: 4, default: 2 } } },
    },
    {
      ...base, type: 'control.join', title: 'Join All Branches', icon: 'combine',
      description: 'Wait for one new message from every incoming edge; use only for branches that all run.',
      inputs: [flowInput], activation: 'all',
    },
    {
      ...base, type: 'control.loop', title: 'Bounded Loop', icon: 'repeat-2',
      description: 'Continue while a comparison passes, up to the configured iteration limit.',
      outputs: flowPorts('continue', 'done'),
      configSchema: { ...comparisonSchema, properties: { ...(comparisonSchema.properties as JsonObject), maxIterations: { type: 'integer', minimum: 0, maximum: 1000, default: 10 } } },
    },
    {
      ...base, type: 'state.read', title: 'Read State', category: 'data', color: '#38bdf8', icon: 'database',
      description: 'Read a shared state field after the previous step has committed.',
      inputs: [flowInput], outputs: [...jsonOutput, ...flowPorts('flow')], completionPort: 'flow',
      configSchema: { type: 'object', properties: { path: { type: 'string', default: '' } } },
    },
    {
      ...base, type: 'state.get', title: 'Get State', category: 'data', color: '#38bdf8', icon: 'database',
      description: 'Read the current state snapshot when a connected node needs the value.',
      executionKind: 'pure', inputs: [], outputs: jsonOutput,
      configSchema: { type: 'object', properties: { path: { title: 'State path', type: 'string', default: '' } } },
    },
    {
      ...base, type: 'state.update', title: 'Update State', category: 'data', color: '#38bdf8', icon: 'list-plus',
      description: 'Update one shared state key using its workflow reducer.',
      configSchema: { type: 'object', properties: { key: { type: 'string', default: 'result' }, source: { type: 'string', enum: ['input', 'value', 'state'], default: 'input' }, path: { type: 'string', default: '' }, value: {} } },
    },
    {
      ...base, type: 'control.end', title: 'End Branch', icon: 'circle-stop',
      description: 'Finish this branch with its data value, or its current flow payload; other active branches can finish.',
      outputs: jsonOutput,
    },
    {
      ...base, type: 'control.interrupt', title: 'Pause for Input', icon: 'pause',
      description: 'Persist a checkpoint and wait for a Host-authorized response before continuing.',
      configSchema: { type: 'object', properties: { prompt: { default: 'Review before continuing' }, stateKey: { type: 'string', default: 'approval' } } },
    },
  ])
}

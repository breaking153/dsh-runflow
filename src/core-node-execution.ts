import type { WorkflowNodeDescriptor, WorkflowPortDescriptor } from './contracts.ts'

type Kind = NonNullable<WorkflowNodeDescriptor['executionKind']>
const kinds: Readonly<Record<string, Kind>> = {
  'trigger.manual': 'trigger', 'trigger.agent': 'trigger', 'trigger.webhook': 'trigger',
  'trigger.schedule': 'trigger', 'trigger.dsh-event': 'trigger',
  'builtin.condition': 'pure', 'builtin.filter': 'pure', 'builtin.merge': 'pure', 'builtin.limit': 'pure',
  'builtin.date-time': 'pure', 'builtin.switch': 'pure', 'builtin.sort': 'pure', 'builtin.aggregate': 'pure',
  'builtin.json-parse': 'pure', 'builtin.json-stringify': 'pure',
  'builtin.set': 'effect', 'builtin.wait': 'effect', 'builtin.stop-error': 'effect', 'builtin.noop': 'effect',
  'http.request': 'effect', 'dsh.agent': 'effect', 'storage.write': 'effect', 'script.javascript': 'effect',
}
const completion = new Set(['builtin.set', 'http.request', 'dsh.agent', 'storage.write', 'script.javascript'])

function appendFlow(ports: WorkflowPortDescriptor[] = []): WorkflowPortDescriptor[] {
  const existing = ports.find(port => port.id === 'flow')
  if (existing !== undefined) {
    if (existing.type !== 'flow') throw new Error('Core completion port conflicts with a data port')
    return ports
  }
  return [...ports, { id: 'flow', label: 'flow', type: 'flow' }]
}

/** Shared shipped-provider metadata; unknown providers retain their own contract. */
export function withCoreNodeExecution<T extends WorkflowNodeDescriptor>(node: T): T {
  const executionKind = Object.hasOwn(kinds, node.type) ? kinds[node.type] : undefined
  if (executionKind === undefined) return node
  return {
    ...node, executionKind,
    ...(node.type === 'storage.write' ? { inputs: appendFlow(node.inputs) } : {}),
    ...(completion.has(node.type) ? { completionPort: 'flow', outputs: appendFlow(node.outputs) } : {}),
  }
}

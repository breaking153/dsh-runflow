import type { WorkflowDefinition, WorkflowExecution } from '../../contracts.ts'
import { validPromotedInputs } from '../../node-properties.ts'

type Check = (value: unknown) => boolean

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text: Check = value => typeof value === 'string'
const identifier: Check = value => typeof value === 'string' && value.length > 0
const number: Check = value => typeof value === 'number' && Number.isFinite(value)
const boolean: Check = value => typeof value === 'boolean'
const optional = (check: Check): Check => value => value === undefined || check(value)
const array = (check: Check): Check => value => Array.isArray(value) && value.every(check)
const values = (check: Check): Check => value => record(value) && Object.values(value).every(check)
const nonnegative: Check = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const oneOf = (...values: string[]): Check => value => typeof value === 'string' && values.includes(value)
const shape = (fields: Record<string, Check>): Check => value =>
  record(value) && Object.entries(fields).every(([key, check]) => check(value[key]))

const position = shape({ x: number, y: number })
const node = shape({
  id: identifier, type: identifier, config: record,
  name: optional(text), position: optional(position), disabled: optional(boolean),
  promotedInputs: optional(validPromotedInputs),
})
const edge = shape({
  from: identifier, to: identifier, id: optional(text),
  sourcePort: optional(text), targetPort: optional(text), condition: optional(boolean),
})
const group = shape({
  id: identifier, label: text, position, width: number, height: number, nodeIds: array(text),
})
const reroute = shape({ id: identifier, position })
const visualEdge = shape({
  id: identifier, source: identifier, target: identifier,
  sourceHandle: optional(text), targetHandle: optional(text),
})
const subflowPort = shape({
  id: identifier, label: text, nodeId: identifier, nodePortId: identifier,
  type: oneOf('any', 'flow', 'json', 'text', 'number', 'boolean', 'file', 'files', 'image', 'audio', 'table', 'error'),
})
const subflow = shape({
  id: identifier, label: text, position, nodes: array(node), edges: array(edge),
  inputs: array(subflowPort), outputs: array(subflowPort),
  groups: optional(array(group)), reroutes: optional(array(reroute)), visualEdges: optional(array(visualEdge)),
})
const ui = shape({
  schemaVersion: value => value === 1,
  groups: array(group), reroutes: array(reroute), visualEdges: array(visualEdge),
  subflows: optional(array(subflow)), linksVisible: optional(boolean), minimapVisible: optional(boolean),
})
const workflow = shape({
  id: identifier, name: text, version: number, nodes: array(node), edges: array(edge),
  outputDir: optional(text), createdAt: optional(text), updatedAt: optional(text), ui: optional(ui),
  execution: optional(shape({
    mode: oneOf('dag', 'state-graph'), entryNodeIds: optional(array(identifier)),
    semantics: optional(oneOf('blueprint')),
    maxSteps: optional(value => nonnegative(value) && (value as number) > 0),
    initialState: optional(record), reducers: optional(values(oneOf('replace', 'append', 'sum', 'merge'))),
  })),
})

const artifact = shape({
  kind: oneOf('input', 'output', 'intermediate', 'logs', 'error', 'manifest'),
  label: text, path: text, mediaType: text,
  nodeId: optional(text), portId: optional(text), bytes: optional(number), preview: optional(text),
})
const log = shape({ timestamp: text, level: oneOf('debug', 'info', 'warn', 'error'), message: text })
const nodeExecution = shape({
  nodeId: identifier, status: oneOf('WAITING', 'RUNNING', 'PAUSED', 'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'),
  step: optional(nonnegative), iteration: optional(nonnegative),
  callId: optional(identifier),
  evaluatedFor: optional(identifier),
  attempts: number, inputPorts: optional(record), outputPorts: optional(record), error: optional(text),
  logs: optional(array(log)), artifacts: optional(array(artifact)),
  startedAt: optional(text), finishedAt: optional(text), durationMs: optional(number),
})
const stepRecord = shape({ step: nonnegative, nodes: array(nodeExecution), state: record })
const activation = shape({
  nodeId: identifier, edgeIndex: optional(nonnegative), from: optional(text),
  sourcePort: optional(text), targetPort: optional(text), value: value => value !== undefined,
  call: optional(shape({ id: identifier, outputs: values(record) })),
})
const checkpoint = shape({
  schemaVersion: value => value === 1, workflowId: identifier, workflowVersion: nonnegative,
  semantics: optional(oneOf('blueprint')),
  executionId: identifier, step: nonnegative, state: record, pending: array(activation),
  joins: values(array(activation)), iterations: values(nonnegative), nodes: array(nodeExecution),
  steps: array(stepRecord), lastOutputs: record, lastPortOutputs: values(record), lastTerminalOutputs: optional(record), interrupts: record,
  startedAt: optional(text),
})
const execution = shape({
  id: identifier, workflowId: identifier, version: number,
  status: oneOf('PENDING', 'RUNNING', 'PAUSED', 'SUCCESS', 'FAILED', 'CANCELLED'), trigger: text,
  nodes: array(nodeExecution), outputDir: optional(text), error: optional(text),
  startedAt: optional(text), finishedAt: optional(text), artifacts: optional(array(artifact)),
  ownerAgentId: optional(identifier), definition: optional(workflow),
  state: optional(record), step: optional(nonnegative), steps: optional(array(stepRecord)),
  checkpoint: optional(checkpoint),
})

// Disk documents are untrusted JSON. Check the fields consumers dereference while
// preserving optional fields and unknown extensions without rewriting documents.
export function isWorkflowDocument(value: unknown): value is WorkflowDefinition {
  return workflow(value)
}

export function isExecutionDocument(value: unknown): value is WorkflowExecution {
  return execution(value)
}

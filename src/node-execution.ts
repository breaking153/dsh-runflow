import type { JsonObject, JsonValue, NodeControlEnvelope, WorkflowNodeDescriptor } from './contracts.ts'

export function validateExecutionDescriptor(descriptor: WorkflowNodeDescriptor): void {
  if (descriptor.executionKind !== undefined && !['trigger', 'pure', 'effect'].includes(descriptor.executionKind)) {
    throw new Error('Invalid executionKind on node provider ' + descriptor.type)
  }
  if (descriptor.executionKind === 'pure' && [...descriptor.inputs ?? [], ...descriptor.outputs ?? []].some(port => port.type === 'flow')) {
    throw new Error('Pure node provider must not declare flow ports: ' + descriptor.type)
  }
  if (descriptor.completionPort !== undefined) {
    const kind = descriptor.executionKind ?? (descriptor.category === 'trigger' ? 'trigger' : 'effect')
    const ports = descriptor.outputs?.filter(port => port.id === descriptor.completionPort)
    if (kind !== 'effect' || typeof descriptor.completionPort !== 'string'
      || !/^[a-z][a-z0-9_-]*$/.test(descriptor.completionPort)
      || ports?.length !== 1 || ports[0]?.type !== 'flow') {
      throw new Error('completionPort must reference a declared effect flow output: ' + descriptor.type)
    }
  }
}

export interface NormalizedNodeOutput {
  output: JsonValue
  ports: JsonObject
  terminalOutput: JsonValue
  control?: NodeControlEnvelope
}

/** Completion is routing evidence. Preserve the provider's original primary and terminal values. */
export function completeNodeOutput(value: Omit<NormalizedNodeOutput, 'terminalOutput'>, descriptor: WorkflowNodeDescriptor): NormalizedNodeOutput {
  const terminalOutput = structuredClone(Object.keys(value.ports).length > 1 ? value.ports : value.output)
  const completion = descriptor.completionPort
  const control = value.control
  if (completion !== undefined && !Object.hasOwn(value.ports, completion)
    && !(control !== undefined && Object.hasOwn(control, 'interrupt')) && control?.halt !== true
    && (control?.routes === undefined || control.routes.includes(completion))) {
    value.ports[completion] = { $runflow: 'flow', payload: structuredClone(value.output) }
  }
  return { ...value, terminalOutput }
}

import type { WorkflowPortType } from './contracts.ts'

/** Execution signals are separate from data; only data inputs may opt into a wildcard. */
export function compatiblePortTypes(output: WorkflowPortType, input: WorkflowPortType): boolean {
  if (output === 'flow' || input === 'flow') return output === input
  return output === input || input === 'any'
}

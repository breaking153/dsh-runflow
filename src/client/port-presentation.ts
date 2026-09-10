import type { WorkflowPortType } from '../contracts.ts'

/** Pin and wire colors share a single vocabulary; geometry identifies execution flow. */
export const PORT_COLORS: Record<WorkflowPortType, string> = {
  flow: '#e6edf5', any: '#b7bfce', json: '#69c6ef', text: '#ed99cf',
  number: '#a3d983', boolean: '#f07887', file: '#8faef5', files: '#8faef5',
  image: '#c8a0ef', audio: '#e9ad72', table: '#6dd4bb', error: '#f07887',
}

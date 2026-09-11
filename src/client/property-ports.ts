import type { WorkflowNode, WorkflowNodeDescriptor, WorkflowPortDescriptor } from '../contracts.ts'
import { effectiveNodeDescriptor, promotedPortId, validPromotedInputs } from '../node-properties.ts'

export interface EditorPortDescriptor extends WorkflowPortDescriptor { unavailable?: boolean }
interface EditorNodeDescriptor extends WorkflowNodeDescriptor { inputs?: EditorPortDescriptor[] }

/** A missing provider must not prevent opening or repairing a saved workflow. */
export function projectNodeDescriptor(node: Pick<WorkflowNode, 'promotedInputs'>, descriptor: WorkflowNodeDescriptor): EditorNodeDescriptor {
  try { return effectiveNodeDescriptor(node, descriptor) } catch {
    const inputs: EditorPortDescriptor[] = [...(descriptor.inputs ?? [{ id: 'input', type: 'any' }])]
    for (const key of node.promotedInputs ?? []) {
      if (!validPromotedInputs([key])) continue
      const id = promotedPortId(key)
      if (inputs.some(port => port.id === id)) continue
      try {
        const property = effectiveNodeDescriptor({ promotedInputs: [key] }, descriptor).inputs?.find(port => port.configKey === key)
        if (property !== undefined) { inputs.push(property); continue }
      } catch { /* Keep a repairable placeholder until provider metadata returns. */ }
      inputs.push({ id, label: key, type: 'any', configKey: key, unavailable: true })
    }
    return { ...descriptor, inputs }
  }
}

export function conflictingProperty(promoted: readonly string[], key: string): string | undefined {
  return promoted.find(other => other !== key && (other.startsWith(key + '.') || key.startsWith(other + '.')))
}

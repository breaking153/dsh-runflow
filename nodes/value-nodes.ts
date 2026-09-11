import type { JsonObject, WorkflowNodeDefinition } from '../src/contracts.ts'
import { valueNodeDescriptors } from '../src/value-node-catalog.ts'

export function valueNodeDefinitions(): WorkflowNodeDefinition[] {
  return valueNodeDescriptors().map(descriptor => ({
    ...descriptor,
    async execute({ node }) {
      const schema = (descriptor.configSchema!.properties as JsonObject).value as JsonObject
      const value = Object.hasOwn(node.config, 'value') ? node.config.value! : schema.default!
      if (schema.type !== undefined && typeof value !== schema.type) throw new Error(descriptor.title + ' requires a ' + schema.type + ' value')
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Value must be a finite number')
      return { $runflow: 'port-outputs', outputs: { value: structuredClone(value) } }
    },
  }))
}

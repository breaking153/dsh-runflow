import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  name: 'runflow-node:demo-multi-output',
  node: {
    type: 'demo.multi-output',
    title: 'Typed Output Splitter',
    description: '演示多输出引脚、类型约束、中间产物与引脚预览。',
    category: 'logic',
    executionKind: 'effect', completionPort: 'flow',
    color: '#38BDF8',
    icon: 'split',
    inputs: [{ id: 'input', label: 'input', type: 'any', required: true }, { id: 'flow', type: 'flow' }],
    outputs: [
      { id: 'payload', label: 'payload', type: 'json' },
      { id: 'message', label: 'message', type: 'text' },
      { id: 'count', label: 'count', type: 'number' },
      { id: 'flow', type: 'flow' },
    ],
  },
  async execute(ctx, execution) {
    const input = Object.hasOwn(execution.inputs, 'input') ? execution.inputs.input! : execution.input
    const count = Array.isArray(input)
      ? input.length
      : input !== null && typeof input === 'object'
        ? Object.keys(input).length
        : 1
    const payload = { version: 'split-v2', value: input, hotReloaded: true }
    await execution.writeIntermediate('normalized-payload', payload, 'payload')
    ctx.logger.info('RunFlow demo splitter processed %d item(s)', count)
    return {
      $runflow: 'port-outputs',
      outputs: { payload, message: 'Processed by split-v2 (hot reload)', count },
    }
  },
})

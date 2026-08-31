import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  name: 'runflow-node:demo-multi-output',
  node: {
    type: 'demo.multi-output',
    title: 'Typed Output Splitter',
    description: '演示多输出引脚、类型约束、中间产物与引脚预览。',
    category: 'logic',
    color: '#38BDF8',
    icon: 'split',
    inputs: [{ id: 'input', label: 'input', type: 'any', required: true }],
    outputs: [
      { id: 'payload', label: 'payload', type: 'json' },
      { id: 'message', label: 'message', type: 'text' },
      { id: 'count', label: 'count', type: 'number' },
    ],
  },
  async execute(ctx, execution) {
    const count = Array.isArray(execution.input)
      ? execution.input.length
      : execution.input !== null && typeof execution.input === 'object'
        ? Object.keys(execution.input).length
        : 1
    const payload = { version: 'split-v2', value: execution.input, hotReloaded: true }
    await execution.writeIntermediate('normalized-payload', payload, 'payload')
    ctx.logger.info('RunFlow demo splitter processed %d item(s)', count)
    return {
      $runflow: 'port-outputs',
      outputs: { payload, message: 'Processed by split-v2 (hot reload)', count },
    }
  },
})

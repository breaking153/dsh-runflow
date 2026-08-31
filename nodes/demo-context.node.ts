import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  name: 'runflow-node:demo-context',
  inject: ['agents', 'llm'],
  node: {
    type: 'demo.context-probe',
    title: 'DSH Context Probe',
    description: '读取实时 Agent 与模型 Provider，验证自定义 Node 可调用 Host ctx。',
    category: 'data',
    color: '#2563EB',
    icon: 'boxes',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [
      { id: 'summary', label: 'summary', type: 'json' },
      { id: 'providers', label: 'providers', type: 'json' },
    ],
  },
  async execute(ctx, execution) {
    const providers = ctx.llm.listProviders().map(provider => ({ id: provider.id, name: provider.name }))
    const summary = {
      version: 'context-v1',
      liveAgents: ctx.agents.list().length,
      providerCount: providers.length,
      input: execution.input,
    }
    execution.log('Read live DSH registries through ctx', {
      liveAgents: summary.liveAgents,
      providerCount: summary.providerCount,
    })
    await execution.writeIntermediate('ctx-snapshot', { summary, providers }, 'summary')
    return { $runflow: 'port-outputs', outputs: { summary, providers } }
  },
})

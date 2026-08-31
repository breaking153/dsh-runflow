import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  name: 'runflow-node:agent-generated-normalizer',
  inject: ['llm'],
  node: {
    type: 'agent.generated-normalizer',
    title: 'AI Generated Normalizer',
    description: '由 AI 通过 RunFlow source API 生成，验证 ctx.llm 与热重载。',
    category: 'data',
    color: '#2563EB',
    icon: 'wand-sparkles',
    inputs: [{ id: 'input', label: 'input', type: 'json' }],
    outputs: [{ id: 'result', label: 'result', type: 'json' }],
  },
  async execute(ctx, execution) {
    const providers = ctx.llm.listProviders()
    const result = {
      version: 'ai-node-v2',
      normalized: execution.input,
      providerCount: providers.length,
      hotReloaded: true,
    }
    execution.log('AI node read live ctx.llm providers', { providerCount: providers.length })
    await execution.writeIntermediate('ai-node-context', {
      providerIds: providers.map(provider => provider.id),
    }, 'result')
    return result
  },
})
import { defineRunFlowNodePlugin } from 'dsh-runflow'

export default defineRunFlowNodePlugin({
  inject: ['llm'],
  node: {
    type: 'local.provider-catalog',
    title: 'Provider catalog',
    description: 'Example trusted Node plugin with typed access to Cordis ctx.',
    category: 'data',
    color: '#2563EB',
    icon: 'boxes',
    inputs: [],
    outputs: [{ id: 'providers', label: 'providers', type: 'json' }],
  },
  async execute(ctx, execution) {
    execution.log('Reading the live DSH LLM registry')
    return {
      $runflow: 'port-outputs',
      outputs: {
        providers: ctx.llm.listProviders().map(provider => ({ id: provider.id, name: provider.name })),
      },
    }
  },
})

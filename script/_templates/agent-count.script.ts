import { defineRunFlowScriptPlugin } from 'dsh-runflow'

export default defineRunFlowScriptPlugin({
  inject: ['agents'],
  node: {
    type: 'local.agent-count',
    title: 'Agent count',
    description: 'Example trusted Script plugin with typed access to Cordis ctx.',
    category: 'action',
    color: '#4A5FA8',
    icon: 'users',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [{ id: 'output', label: 'output', type: 'json' }],
  },
  async execute(ctx, execution) {
    return {
      input: execution.input,
      liveAgents: ctx.agents.list().length,
    }
  },
})

import { defineRunFlowScriptPlugin } from 'dsh-runflow'

export default defineRunFlowScriptPlugin({
  name: 'runflow-script:agent-generated-ctx',
  inject: ['agents', 'flow'],
  node: {
    type: 'agent.generated-ctx-script',
    title: 'AI Generated Context Script',
    description: '由 AI 通过 RunFlow source API 生成，验证 Script 对 Host ctx 的调用。',
    category: 'action',
    color: '#38BDF8',
    icon: 'file-code-2',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [{ id: 'result', label: 'result', type: 'json' }],
  },
  async execute(ctx, execution) {
    const result = {
      version: 'ai-script-v2',
      agentCount: ctx.agents.list().length,
      hotReloaded: true,
      nodeCount: ctx.flow.listNodes().length,
      input: execution.input,
    }
    execution.log('AI script read ctx.agents and ctx.flow', {
      agentCount: result.agentCount,
      nodeCount: result.nodeCount,
    })
    await execution.writeIntermediate('ai-script-context', result, 'result')
    return result
  },
})
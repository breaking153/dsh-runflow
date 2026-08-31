import { defineRunFlowScriptPlugin } from 'dsh-runflow'

export default defineRunFlowScriptPlugin({
  name: 'runflow-script:demo-run-code-channel',
  inject: ['flowScript'],
  node: {
    type: 'demo.run-code-channel',
    title: 'Run Code Channel',
    description: '通过 ctx.flowScript 的 submit/wait channel 调用 DSH 原生 run_code。',
    category: 'action',
    color: '#4F7CFF',
    icon: 'square-code',
    inputs: [{ id: 'input', label: 'input', type: 'any' }],
    outputs: [
      { id: 'result', label: 'result', type: 'json' },
      { id: 'receipt', label: 'receipt', type: 'json' },
    ],
  },
  async execute(ctx, execution) {
    if (execution.agentId === undefined) throw new Error('Run Code Channel requires a live DSH Agent')
    const ticket = ctx.flowScript.submit({
      executionId: execution.executionId,
      nodeId: execution.node.id,
      agentId: execution.agentId,
      description: 'RunFlow demo Script plugin channel execution',
      program: "return { version: 'script-v2', echoed: input, hotReloaded: true, hostOutputDir: runflow.outputDir }",
      input: execution.input,
      inputs: { ...execution.inputs },
      config: execution.node.config,
      ...(execution.outputDir === undefined ? {} : { outputDir: execution.outputDir }),
      ...(execution.intermediateDir === undefined ? {} : { intermediateDir: execution.intermediateDir }),
      signal: execution.signal,
    })
    execution.log('Waiting for run_code channel result', { requestId: ticket.requestId })
    const settled = await ctx.flowScript.wait(ticket.requestId, execution.signal)
    if (settled.status !== 'success') throw new Error(settled.error?.message ?? 'run_code channel failed')
    const receipt = {
      requestId: settled.requestId,
      status: settled.status,
      transport: settled.runtime.transport,
      language: settled.runtime.language,
      durationMs: settled.timing.durationMs,
    }
    await execution.writeIntermediate('channel-receipt', receipt, 'receipt')
    return {
      $runflow: 'port-outputs',
      outputs: { result: settled.value ?? null, receipt },
    }
  },
})

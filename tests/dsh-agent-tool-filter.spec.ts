import type { Context } from '@deepseek-ai/cordis'
import type { SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import { describe, expect, it } from 'vitest'
import { createDshAgentNodeExecutor } from '../src/backend/v2/dsh-agent-node.ts'
import type { JsonObject, NodeExecutionContext } from '../src/contracts.ts'

function fixture(config: JsonObject, supportsToolFilter = true) {
  let requested: SubagentStartRequest | undefined
  const ctx = {
    agents: { list: () => [{ id: 'parent', options: {} }] },
    subagents: {
      list: () => ['fixture'],
      getProvider: () => ({ inheritsParentContext: false, capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: supportsToolFilter, persona: true } }),
      start: async (_name: string, request: SubagentStartRequest) => {
        requested = request
        return { id: 'child', result: Promise.resolve({ output: [{ type: 'text', text: 'Done' }], stopReason: 'completed' }), dispose: async () => {} }
      },
    },
  } as unknown as Context
  const node = { id: 'agent', type: 'dsh.agent', config }
  const execution: NodeExecutionContext = {
    executionId: 'test-execution', agentId: 'parent', workflow: { id: 'test', name: 'Tool restrictions', version: 1, nodes: [node], edges: [] },
    node, input: null, inputs: {}, vars: {}, signal: new AbortController().signal,
    log() {}, writeIntermediate: async label => ({ kind: 'intermediate', label, path: 'in-memory.json', mediaType: 'application/json' }),
  }
  return { execute: () => createDshAgentNodeExecutor(ctx)(execution), requested: () => requested }
}

describe('Agent node tool allow restrictions', () => {
  it.each<JsonObject>([{ toolFilter: { allow: [] } }, { toolAllow: [] }])('preserves explicit empty allow through the SDK boundary: %j', async config => {
    const run = fixture(config)
    const result = await run.execute()
    expect(run.requested()?.toolFilter).toEqual({ allow: [] })
    expect(result).toMatchObject({ request: { toolFilter: { allow: [] } } })
  })
  it('rejects an empty allow restriction when the provider cannot enforce tool filters', async () => {
    const run = fixture({ toolFilter: { allow: [] } }, false)
    await expect(run.execute()).rejects.toThrow('does not support toolFilter')
    expect(run.requested()).toBeUndefined()
  })
  it.each<JsonObject>([{}, { toolFilter: {} }, { toolFilter: { allow: '' } }, { toolFilter: { allow: ' , \n ' } }, { toolFilter: { deny: [] } }])('keeps unset or empty text filters unset: %j', async config => {
    const run = fixture(config, false)
    await run.execute()
    expect(run.requested()?.toolFilter).toBeUndefined()
  })
  it('still normalizes tool names and keeps deny restrictions alongside an empty allow', async () => {
    const run = fixture({ toolFilter: { allow: [], deny: [' shell ', 'shell'] } })
    await run.execute()
    expect(run.requested()?.toolFilter).toEqual({ allow: [], deny: ['shell'] })
  })
})

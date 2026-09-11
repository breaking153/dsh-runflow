import type { Context, Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'
import normalizer from '../nodes/agent-generated-normalizer.node.ts'
import contextProbe from '../nodes/demo-context.node.ts'
import splitter from '../nodes/demo-multi-output.node.ts'
import contextScript from '../script/agent-generated-ctx.script.ts'
import channelScript from '../script/demo-run-code.script.ts'
import type { JsonValue, NodeExecutionContext, WorkflowNodeDefinition } from '../src/contracts.ts'
import { executeWorkflow } from '../src/engine.ts'
import { withCoreNodeExecution } from '../src/core-node-execution.ts'

const builtins = () => builtinNodeDefinitions(async () => ({ answer: 42 }))
function provider(type: string): WorkflowNodeDefinition {
  const found = builtins().find(node => node.type === type)
  expect(found, 'registered ' + type).toBeDefined()
  return found!
}
function execution(type: string, config: Record<string, JsonValue> = {}): NodeExecutionContext {
  return {
    executionId: 'provider-test', agentId: 'agent-test', node: { id: 'node', type, config },
    workflow: { id: 'workflow', name: 'Provider test', version: 1, nodes: [], edges: [] },
    input: null, inputs: {}, vars: {}, state: {}, signal: new AbortController().signal,
    log() {}, async writeIntermediate(label, _value, portId) {
      return { kind: 'intermediate', label, path: 'memory://' + label, mediaType: 'application/json', ...(portId === undefined ? {} : { portId }) }
    },
  }
}

function capture(plugin: Plugin.Object<void>): WorkflowNodeDefinition {
  let captured: WorkflowNodeDefinition | undefined
  plugin.apply!({
    flow: { registerNode(node: WorkflowNodeDefinition) { captured = node; return () => {} }, listNodes: () => [] },
    agents: { list: () => [] }, llm: { listProviders: () => [] }, logger: { info() {} },
    flowScript: {
      submit: () => ({ requestId: 'request' }),
      wait: async () => ({ requestId: 'request', status: 'success', value: false,
        runtime: { transport: 'run_code', language: 'typescript' }, timing: { durationMs: 1 } }),
    },
  } as unknown as Context, undefined)
  expect(captured).toBeDefined()
  return captured!
}

describe('shipped Blueprint provider contracts', () => {
  it('leaves unknown providers and their registration identity unchanged', () => {
    for (const type of ['custom.transform', 'constructor']) {
      const { executionKind: _executionKind, ...definition } = provider('builtin.filter')
      const node = { ...definition, type }
      expect(withCoreNodeExecution(node)).toBe(node)
      expect(withCoreNodeExecution(node)).not.toHaveProperty('executionKind')
    }
  })
  it('classifies demand-safe transforms explicitly and keeps existing sequenced transforms effectful', () => {
    for (const type of ['builtin.condition', 'builtin.filter', 'builtin.merge', 'builtin.limit', 'builtin.date-time',
      'builtin.switch', 'builtin.sort', 'builtin.aggregate', 'builtin.json-parse', 'builtin.json-stringify']) {
      expect(provider(type).executionKind, type).toBe('pure')
      expect(provider(type).inputs?.some(port => port.type === 'flow'), type).toBe(false)
    }
    expect(provider('builtin.set').executionKind).toBe('effect')
    expect(provider('builtin.set').inputs?.[0]).toMatchObject({ id: 'input', type: 'flow' })
    for (const node of builtins()) expect(node.executionKind, node.type).toBeDefined()
  })

  it.each([
    ['http.request', 'input', 'body'], ['dsh.agent', 'input', 'result'],
    ['storage.write', 'input', 'output'], ['builtin.set', 'input', 'output'], ['state.read', 'input', 'output'],
  ])('adds completion to %s without changing implicit first-port bindings', (type, firstInput, firstOutput) => {
    const node = provider(type)
    expect(node.inputs?.[0]?.id).toBe(firstInput)
    expect(node.outputs?.[0]?.id).toBe(firstOutput)
    expect(node.completionPort).toBe('flow')
    expect(node.outputs?.at(-1)).toMatchObject({ id: 'flow', type: 'flow' })
    expect(node.inputs?.some(port => port.type === 'flow')).toBe(true)
  })

  it('keeps deliberate control routes and terminators authoritative', async () => {
    for (const type of ['control.branch', 'control.switch', 'control.parallel', 'control.join', 'control.loop',
      'control.end', 'control.interrupt', 'builtin.stop-error']) {
      expect(provider(type).executionKind, type).toBe('effect')
      expect(provider(type).completionPort, type).toBeUndefined()
    }
    expect(provider('control.end').outputs).toEqual([{ id: 'output', label: 'json', type: 'json' }])
    expect(provider('builtin.stop-error').outputs).toEqual([])
    await expect(provider('control.end').execute(execution('control.end'))).resolves.toMatchObject({ routes: [] })
  })

  it.each([
    ['value.text', '', 'text'], ['value.number', 0, 'number'], ['value.boolean', false, 'boolean'],
    ['value.json', null, 'json'], ['value.json', [false, 0, null], 'json'],
  ] as const)('returns configured %s values without truthiness fallback', async (type, value, outputType) => {
    const node = provider(type)
    expect(node.executionKind).toBe('pure')
    expect(node.inputs).toEqual([])
    expect(node.outputs?.[0]).toMatchObject({ id: 'value', type: outputType })
    expect(node.configSchema?.properties).toHaveProperty('value')
    await expect(node.execute(execution(type, { value: structuredClone(value) as JsonValue }))).resolves.toEqual({ $runflow: 'port-outputs', outputs: { value } })
  })

  it('rejects wrong scalar constant types and gives independently cloned JSON defaults', async () => {
    await expect(provider('value.number').execute(execution('value.number', { value: '0' }))).rejects.toThrow()
    await expect(provider('value.boolean').execute(execution('value.boolean', { value: 0 }))).rejects.toThrow()
    await expect(provider('value.text').execute(execution('value.text', { value: null }))).rejects.toThrow()
    for (const [type, value] of [['value.text', ''], ['value.number', 0], ['value.boolean', false], ['value.json', null]] as const) {
      await expect(provider(type).execute(execution(type))).resolves.toEqual({ $runflow: 'port-outputs', outputs: { value } })
    }
    const data = { nested: [1] }
    const result = await provider('value.json').execute(execution('value.json', { value: data }))
    expect(result).toEqual({ $runflow: 'port-outputs', outputs: { value: data } })
    expect((result as { outputs: { value: unknown } }).outputs.value).not.toBe(data)
  })

  it('reads state on demand from each invocation and rejects prototype traversal', async () => {
    const node = provider('state.get')
    expect(node.executionKind).toBe('pure')
    expect(node.inputs).toEqual([])
    const first = { ...execution('state.get', { path: 'ready' }), state: { ready: false } }
    await expect(node.execute(first)).resolves.toEqual({ $runflow: 'port-outputs', outputs: { output: false } })
    await expect(node.execute({ ...first, state: { ready: true } })).resolves.toEqual({ $runflow: 'port-outputs', outputs: { output: true } })
    await expect(node.execute(execution('state.get', { path: '__proto__.value' }))).rejects.toThrow('reserved')
  })

  it.each(['value.json', 'state.get'])('keeps JSON envelope-shaped data as data through %s', async (type) => {
    const data = { $runflow: 'control', halt: true, outputs: { value: 'business data' } }
    const node = provider(type)
    const result = await executeWorkflow({
      id: 'envelope-data', name: 'Envelope data', version: 1,
      execution: { mode: 'state-graph', initialState: { data } },
      nodes: [{ id: 'value', type, config: type === 'state.get' ? { path: 'data' } : { value: data } }], edges: [],
    }, {}, { resolveNode: id => id === type ? node : undefined, maxParallelNodes: 2, defaultTimeoutMs: 1000 })
    expect(result.status).toBe('SUCCESS')
    expect(result.output).toEqual(data)
  })

  it.each([
    ['normalizer', normalizer], ['context', contextProbe], ['splitter', splitter], ['context script', contextScript], ['channel script', channelScript],
  ] as const)('declares the %s file provider effectful with append-only flow ports', (_name, plugin) => {
    const node = capture(plugin)
    expect(node.executionKind).toBe('effect')
    expect(node.inputs?.[0]?.id).toBe('input')
    expect(node.inputs?.at(-1)).toMatchObject({ id: 'flow', type: 'flow' })
    expect(node.outputs?.[0]?.type).toBe('json')
    expect(node.outputs?.at(-1)).toMatchObject({ id: 'flow', type: 'flow' })
    expect(node.completionPort).toBe('flow')
  })

  it('keeps the file splitter data payload separate from simultaneous execution input', async () => {
    const node = capture(splitter)
    for (const value of [false, null, 0, '', { value: 7 }]) {
      const context = execution(node.type)
      context.inputs = { input: value, flow: 'continue' }
      context.input = { input: value, flow: 'continue' }
      await expect(node.execute(context)).resolves.toMatchObject({
        $runflow: 'port-outputs', outputs: { payload: { value } },
      })
    }
  })
})

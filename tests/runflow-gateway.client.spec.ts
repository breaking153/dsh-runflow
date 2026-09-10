// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { WorkflowDefinition } from '../src/contracts.ts'
import {
  createRunFlowGatewayV2Adapter,
  requireRunFlowGateway,
  type RunFlowClientContext,
} from '../src/client/application/runflow-gateway.ts'
import type { FlowRuntimeClient } from '../src/client/runtime.ts'
import { clientContextForRuntime } from '../src/client/runtime.ts'

const workflow: WorkflowDefinition = {
  id: 'review-flow',
  name: 'Review flow',
  version: 3,
  nodes: [{ id: 'manual', type: 'trigger.manual', config: {} }],
  edges: [],
}

function runtimeFixture(): FlowRuntimeClient {
  return {
    currentAgentId: () => 'agent-1',
    workspace: vi.fn(async () => ({
      apiVersion: 2 as const, workflows: [workflow], executions: [], nodes: [], subagentProviders: [],
      capabilities: { creationMode: true, runCode: true, nodeAuthoring: true, sourceAuthoring: true },
    })),
    save: vi.fn(async (_agentId, definition) => definition),
    remove: vi.fn(async () => true),
    start: vi.fn(async () => ({
      executionId: 'execution-1',
      execution: {
        id: 'execution-1', workflowId: workflow.id, version: workflow.version,
        status: 'RUNNING' as const, trigger: 'ui', nodes: [],
      },
    })),
    resume: vi.fn(async () => ({ executionId: 'execution-1', execution: { id: 'execution-1', workflowId: workflow.id, version: 3, status: 'RUNNING' as const, trigger: 'ui', nodes: [] } })),
    webhook: vi.fn(async () => null),
    enableWebhook: vi.fn(async () => ({ binding: { id: 'hook', workflowId: workflow.id, triggerNodeId: 'manual', path: '/runflow/webhooks/hook', createdAt: '2026-09-10T00:00:00Z' }, token: 'secret' })),
    disableWebhook: vi.fn(async () => true),
    execution: vi.fn(async () => null),
    cancel: vi.fn(async () => true),
    sources: vi.fn(async () => []),
    saveSource: vi.fn(async (_agentId, request) => ({
      kind: request.kind,
      name: request.name,
      version: 'fixture',
      bytes: request.content.length,
      content: request.content,
      updatedAt: '2026-09-02T00:00:00.000Z',
    })),
  }
}

describe('RunFlow frontend gateway v2', () => {
  it('maps explicit client context through the Host v2 adapter', async () => {
    const runtime = runtimeFixture()
    const gateway = createRunFlowGatewayV2Adapter(runtime)
    const context: RunFlowClientContext = { agentId: 'agent-review' }

    await expect(gateway.workspace.read(context)).resolves.toEqual(expect.objectContaining({ workflows: [workflow] }))
    await expect(gateway.workflows.save(context, workflow)).resolves.toEqual(workflow)
    await expect(gateway.executions.start(context, { definition: workflow })).resolves.toEqual(expect.objectContaining({ executionId: 'execution-1' }))

    await gateway.executions.resume(context, 'execution-1', { approved: true })
    await gateway.webhooks.read(context, workflow.id)
    await gateway.webhooks.enable(context, workflow.id, 'manual')
    await gateway.webhooks.disable(context, workflow.id)
    expect(runtime.resume).toHaveBeenCalledWith('agent-review', 'execution-1', { approved: true })
    expect(runtime.webhook).toHaveBeenCalledWith('agent-review', workflow.id)
    expect(runtime.enableWebhook).toHaveBeenCalledWith('agent-review', workflow.id, 'manual')
    expect(runtime.disableWebhook).toHaveBeenCalledWith('agent-review', workflow.id)
    expect(runtime.workspace).toHaveBeenCalledWith('agent-review')
    expect(runtime.save).toHaveBeenCalledWith('agent-review', workflow)
    expect(runtime.start).toHaveBeenCalledWith('agent-review', { definition: workflow })
    expect(gateway.version).toBe(2)
  })

  it('keeps review methods explicit until the Host v2 implementation exists', async () => {
    const gateway = createRunFlowGatewayV2Adapter(runtimeFixture())
    const context: RunFlowClientContext = { agentId: 'agent-review' }

    await expect(gateway.reviews.read(context, workflow.id)).resolves.toBeNull()
    await expect(gateway.reviews.accept(context, workflow.id, workflow.version)).rejects.toThrow('RUNFLOW_V2_REVIEW_UNAVAILABLE')
  })

  it('throws an actionable offline error instead of returning a preview gateway', () => {
    expect(() => requireRunFlowGateway(undefined)).toThrow('RUNFLOW_HOST_UNAVAILABLE')
  })

  it('derives an explicit gateway context only from a DSH main session', () => {
    const connected = runtimeFixture()
    expect(clientContextForRuntime(connected)).toEqual({ agentId: 'agent-1' })
    expect(clientContextForRuntime({ ...connected, currentAgentId: () => undefined })).toBeUndefined()
  })
})

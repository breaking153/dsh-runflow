import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from './contracts.ts'
import type { FlowService } from './flow-service.ts'
import { assertRunFlowExecutionOwner, createRunFlowToolAccess, runFlowHistoryLimit } from './flow-tool-access.ts'
import { RUNFLOW_RUNTIME_SKILL } from './runtime-skills.ts'

function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(name + ' is required')
  return value.trim()
}

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue
}

/** Register ordinary Agent execution tools and guidance under the plugin's lifetime. */
export function installRunFlowRuntime(ctx: Context, flow: FlowService): void {
  ctx.effect(() => {
    const access = createRunFlowToolAccess(ctx, flow)
    const unregisterTool = ctx.tools.register(defineTool({
      name: 'runflow',
      description: 'Inspect and run persisted DSH RunFlow workflows using the current live Agent. '
        + 'start returns an execution snapshot; get_execution reports progress or a PAUSED checkpoint. '
        + 'Only this Agent can inspect, cancel, or resume its executions. capabilities reports live trigger support.',
      parameters: {
        action: {
          type: 'string', required: true,
          enum: ['capabilities', 'list', 'get', 'start', 'get_execution', 'list_executions', 'cancel', 'resume'],
        },
        workflowId: { type: 'string', description: 'Existing workflow id for get/start, or history filter.' },
        executionId: { type: 'string', description: 'Owned execution id for get_execution/cancel/resume.' },
        input: { type: 'json', description: 'Workflow input for start.' },
        value: { type: 'json', description: 'Explicit JSON response to the paused checkpoint for resume; null is allowed.' },
        limit: { type: 'integer', description: 'Execution history size, between 0 and 200; default 50.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const { agentId } = access.require(exec)
        switch (args.action) {
          case 'capabilities':
            return json({ available: true, triggers: flow.triggerCapabilities() })
          case 'list':
            return json({ workflows: flow.listWorkflows() })
          case 'get': {
            const id = required(args.workflowId, 'workflowId')
            const workflow = flow.workflow(id)
            if (workflow === undefined) throw new Error('Workflow not found: ' + id)
            return json(workflow)
          }
          case 'start':
            return json(flow.start(required(args.workflowId, 'workflowId'), {
              agentId, trigger: 'agent', signal: exec.signal,
              ...(args.input === undefined ? {} : { input: args.input }),
            }))
          case 'get_execution': {
            const id = required(args.executionId, 'executionId')
            assertRunFlowExecutionOwner(flow, id, agentId)
            const execution = flow.execution(id)
            if (execution === undefined) throw new Error('RunFlow execution not found')
            return json(execution)
          }
          case 'list_executions': {
            const limit = runFlowHistoryLimit(args.limit)
            return json({ executions: flow.listExecutions(args.workflowId, Number.MAX_SAFE_INTEGER)
              .filter(execution => flow.executionOwnedBy(execution.id, agentId)).slice(0, limit) })
          }
          case 'cancel': {
            const id = required(args.executionId, 'executionId')
            assertRunFlowExecutionOwner(flow, id, agentId)
            return json({ cancelled: flow.cancel(id) })
          }
          case 'resume': {
            const id = required(args.executionId, 'executionId')
            assertRunFlowExecutionOwner(flow, id, agentId)
            if (args.value === undefined) throw new Error('value is required to resume a checkpoint')
            return json(flow.resume(id, args.value, { agentId, signal: exec.signal }))
          }
        }
      },
      presentCall(args) {
        return {
          card: 'generic', title: 'RunFlow · ' + args.action,
          kind: ['start', 'cancel', 'resume'].includes(args.action) ? 'execute' : 'read',
          rawInput: args.workflowId ?? args.executionId ?? args.action,
        }
      },
    }))
    const skillFiber = ctx.inject(['skills'], skillCtx => {
      skillCtx.skills.register(RUNFLOW_RUNTIME_SKILL)
    })
    return async () => {
      access.close()
      unregisterTool()
      await skillFiber.dispose()
    }
  }, 'dsh-runflow: Agent runtime tools and skill')
}

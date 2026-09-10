import { symbols, type Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { FlowService } from './flow-service.ts'

/** Resolve the concrete subject behind a Cordis service or Agent view. */
export function runFlowSubject<T extends object>(value: T): T {
  return (value as T & { [key: symbol]: T })[symbols.original] ?? value
}

/** A tool contribution's live service and Agent admission checks. */
export function createRunFlowToolAccess(ctx: Context, flow: FlowService) {
  let active = true
  return {
    close(): void { active = false },
    available(): boolean {
      const current = ctx.get('flow')
      return active && current !== undefined
        && runFlowSubject(current) === runFlowSubject(flow)
        && flow.isAvailable()
    },
    require(exec: ToolRunContext): { flow: FlowService; agent: Agent; agentId: string } {
      exec.signal.throwIfAborted()
      if (!this.available()) throw new Error('RunFlow is unavailable; enable its DSH plugin before calling this tool')
      const agent = exec.agent === undefined ? undefined : runFlowSubject(exec.agent)
      const agents = ctx.get('agents')
      if (agent === undefined || !agents?.list().some(candidate => runFlowSubject(candidate) === agent)) {
        throw new Error('RunFlow requires the current live Agent supplied by DSH')
      }
      return { flow, agent, agentId: String(agent.id) }
    },
  }
}

export type RunFlowToolAccess = ReturnType<typeof createRunFlowToolAccess>

/** Require execution ownership before revealing state or changing a run. */
export function assertRunFlowExecutionOwner(flow: FlowService, executionId: string, agentId: string): void {
  if (!flow.executionOwnedBy(executionId, agentId)) throw new Error('RunFlow execution is not owned by this Agent')
}

/** Bound a model-requested history page without accepting negative or unsafe limits. */
export function runFlowHistoryLimit(value: number | undefined): number {
  if (value === undefined) return 50
  if (!Number.isSafeInteger(value) || value < 0 || value > 200) throw new Error('limit must be an integer between 0 and 200')
  return value
}

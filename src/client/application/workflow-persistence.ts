import type { WorkflowDefinition } from '../../contracts.ts'
import type { RunFlowClientContext, RunFlowGatewayV2 } from './runflow-gateway.ts'

export interface WorkflowDraft {
  definition: WorkflowDefinition
  error?: string
}

/** Host version/timestamps describe persistence, not a user edit. */
export function sameWorkflowContent(left: WorkflowDefinition, right: WorkflowDefinition): boolean {
  const content = ({ version: _version, createdAt: _createdAt, updatedAt: _updatedAt, ...definition }: WorkflowDefinition) => definition
  return JSON.stringify(content(left)) === JSON.stringify(content(right))
}

/** Keep writes ordered per Host, main session and workflow, while unrelated workflows save independently. */
export function createWorkflowPersistenceQueue() {
  type PendingSave = { kind: 'save'; definition: WorkflowDefinition; result: Promise<WorkflowDefinition | undefined> }
  type PendingDelete = { kind: 'delete'; result: Promise<boolean | undefined> }
  const hosts = new WeakMap<RunFlowGatewayV2, Map<string, PendingSave | PendingDelete>>()
  const keyFor = (context: RunFlowClientContext, workflowId: string): string => JSON.stringify([context.agentId, workflowId])
  return {
    isDeleting(gateway: RunFlowGatewayV2, context: RunFlowClientContext, workflowId: string): boolean {
      return hosts.get(gateway)?.get(keyFor(context, workflowId))?.kind === 'delete'
    },
    hasLaterOperation(gateway: RunFlowGatewayV2, context: RunFlowClientContext, workflowId: string, result: Promise<WorkflowDefinition | undefined>): boolean {
      const pending = hosts.get(gateway)?.get(keyFor(context, workflowId))
      return pending !== undefined && pending.result !== result
    },
    save(gateway: RunFlowGatewayV2, context: RunFlowClientContext, definition: WorkflowDefinition, isCurrent: () => boolean): Promise<WorkflowDefinition | undefined> {
      let pending = hosts.get(gateway)
      if (pending === undefined) { pending = new Map(); hosts.set(gateway, pending) }
      const key = keyFor(context, definition.id)
      const previous = pending.get(key)
      if (previous?.kind === 'delete') return Promise.resolve(undefined)
      if (previous !== undefined && sameWorkflowContent(previous.definition, definition)) return previous.result
      const write = (): Promise<WorkflowDefinition | undefined> => isCurrent()
        ? gateway.workflows.save(context, definition)
        : Promise.resolve(undefined)
      const result = previous === undefined ? write() : previous.result.then(write, write)
      const entry: PendingSave = { kind: 'save', definition, result }
      pending.set(key, entry)
      const cleanup = (): void => { if (pending.get(key) === entry) pending.delete(key) }
      void result.then(cleanup, cleanup)
      return result
    },
    delete(gateway: RunFlowGatewayV2, context: RunFlowClientContext, workflowId: string, isCurrent: () => boolean): Promise<boolean | undefined> {
      let pending = hosts.get(gateway)
      if (pending === undefined) { pending = new Map(); hosts.set(gateway, pending) }
      const key = keyFor(context, workflowId)
      const previous = pending.get(key)
      if (previous?.kind === 'delete') return previous.result
      const remove = (): Promise<boolean | undefined> => isCurrent()
        ? gateway.workflows.delete(context, workflowId)
        : Promise.resolve(undefined)
      const result = previous === undefined ? remove() : previous.result.then(remove, remove)
      const entry: PendingDelete = { kind: 'delete', result }
      pending.set(key, entry)
      const cleanup = (): void => { if (pending.get(key) === entry) pending.delete(key) }
      void result.then(cleanup, cleanup)
      return result
    },
  }
}

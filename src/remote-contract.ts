import type {
  RemoteResult,
  TypertRemoteContribution,
  TypertSchema,
} from '@deepseek-ai/dsh-typert-protocol'
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry'
import type { JsonValue, WorkflowDefinition, WorkflowExecution, WorkflowNodeDescriptor } from './contracts.ts'
import type { RunFlowPluginSource, SaveRunFlowPluginSourceRequest } from './plugin-sources.ts'

export interface RunFlowStartRequest {
  definition: WorkflowDefinition
  input?: JsonValue
  outputDir?: string
  /** Execute the selected node and all of its upstream dependencies. */
  targetNodeId?: string
}

export interface RunFlowStartReceipt {
  executionId: string
  execution: WorkflowExecution
}

export interface RunFlowWorkspaceSnapshot {
  workflows: WorkflowDefinition[]
  executions: WorkflowExecution[]
  /** Live Host registry, including dynamically loaded Node and Script providers. */
  nodes: WorkflowNodeDescriptor[]
  capabilities: {
    creationMode: boolean
    runCode: boolean
    nodeAuthoring: boolean
    sourceAuthoring: boolean
  }
}

export interface RunFlowRemoteNamespace {
  workspace(agentId: string): Promise<RemoteResult<RunFlowWorkspaceSnapshot>>
  save(agentId: string, definition: WorkflowDefinition): Promise<RemoteResult<WorkflowDefinition>>
  deleteWorkflow(agentId: string, workflowId: string): Promise<RemoteResult<boolean>>
  publish(agentId: string, workflowId: string, published: boolean): Promise<RemoteResult<WorkflowDefinition>>
  start(agentId: string, request: RunFlowStartRequest): Promise<RemoteResult<RunFlowStartReceipt>>
  execution(agentId: string, executionId: string): Promise<RemoteResult<WorkflowExecution | null>>
  cancel(agentId: string, executionId: string): Promise<RemoteResult<boolean>>
  sources(agentId: string): Promise<RemoteResult<RunFlowPluginSource[]>>
  saveSource(agentId: string, request: SaveRunFlowPluginSourceRequest): Promise<RemoteResult<RunFlowPluginSource>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    runflow: RunFlowRemoteNamespace
  }
}

function assertJson(value: unknown, path = 'value'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return
    throw new TypeError(path + ' must be a finite JSON number')
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJson(item, path + '[' + String(index) + ']'))
    return
  }
  if (typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new TypeError(path + '.' + key + ' cannot be undefined')
      assertJson(item, path + '.' + key)
    }
    return
  }
  throw new TypeError(path + ' is not JSON')
}

const jsonSchema: TypertSchema = { parse(value: unknown): unknown { assertJson(value); return value } }
const stringSchema: TypertSchema<string> = {
  parse(value: unknown): string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError('expected a non-empty string')
    return value
  },
}
const booleanSchema: TypertSchema<boolean> = {
  parse(value: unknown): boolean {
    if (typeof value !== 'boolean') throw new TypeError('expected a boolean')
    return value
  },
}
const codec = (typeSymbol: string, schema: TypertSchema) => ({ mode: 'strict' as const, typeSymbol, schema })
const agentParameter = {
  name: 'agent', wire: 'agentId', source: 'lookup' as const, lookup: 'agent',
  codec: codec('@deepseek-ai/dsh-session/types#SessionId', stringSchema),
}
const jsonParameter = (name: string, typeSymbol: string) => ({
  name, wire: name, source: 'json' as const, codec: codec(typeSymbol, jsonSchema),
})
const stringParameter = (name: string, typeSymbol: string) => ({
  name, wire: name, source: 'json' as const, codec: codec(typeSymbol, stringSchema),
})

export const RUNFLOW_REMOTE = {
  package: 'dsh-runflow',
  descriptors: [
    {
      id: 'dsh-runflow#runflow/workspace', service: 'runflowRemote', namespace: 'runflow', method: 'workspace',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter],
      result: codec('dsh-runflow#RunFlowWorkspaceSnapshot', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/save', service: 'runflowRemote', namespace: 'runflow', method: 'save',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, jsonParameter('definition', 'dsh-runflow#WorkflowDefinition')],
      result: codec('dsh-runflow#WorkflowDefinition', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/remove', service: 'runflowRemote', namespace: 'runflow', method: 'deleteWorkflow',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, stringParameter('workflowId', 'dsh-runflow#WorkflowId')],
      result: codec('dsh-runflow#Boolean', booleanSchema),
    },
    {
      id: 'dsh-runflow#runflow/publish', service: 'runflowRemote', namespace: 'runflow', method: 'publish',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [
        agentParameter,
        stringParameter('workflowId', 'dsh-runflow#WorkflowId'),
        { name: 'published', wire: 'published', source: 'json', codec: codec('dsh-runflow#Boolean', booleanSchema) },
      ],
      result: codec('dsh-runflow#WorkflowDefinition', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/start', service: 'runflowRemote', namespace: 'runflow', method: 'start',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, jsonParameter('request', 'dsh-runflow#RunFlowStartRequest')],
      result: codec('dsh-runflow#RunFlowStartReceipt', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/execution', service: 'runflowRemote', namespace: 'runflow', method: 'execution',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, stringParameter('executionId', 'dsh-runflow#ExecutionId')],
      result: codec('dsh-runflow#WorkflowExecutionOrNull', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/cancel', service: 'runflowRemote', namespace: 'runflow', method: 'cancel',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, stringParameter('executionId', 'dsh-runflow#ExecutionId')],
      result: codec('dsh-runflow#Boolean', booleanSchema),
    },
    {
      id: 'dsh-runflow#runflow/sources', service: 'runflowRemote', namespace: 'runflow', method: 'sources',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter],
      result: codec('dsh-runflow#RunFlowPluginSourceList', jsonSchema),
    },
    {
      id: 'dsh-runflow#runflow/save-source', service: 'runflowRemote', namespace: 'runflow', method: 'saveSource',
      invocation: { kind: 'direct' }, scope: { context: 'agent', wire: 'agentId' }, parameters: [agentParameter, jsonParameter('request', 'dsh-runflow#SaveRunFlowPluginSourceRequest')],
      result: codec('dsh-runflow#RunFlowPluginSource', jsonSchema),
    },
  ],
} satisfies TypertRemoteContribution

/** Host-side strict registry contribution backing the Client Remote contract. */
export const RUNFLOW_HOST = {
  package: 'dsh-runflow',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: RUNFLOW_REMOTE.descriptors,
} satisfies TypertContribution

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export interface WorkflowPosition {
  x: number
  y: number
}

export interface WorkflowNode {
  id: string
  type: string
  name?: string
  config: JsonObject
  position?: WorkflowPosition
  disabled?: boolean
}

export interface WorkflowEdge {
  id?: string
  from: string
  to: string
  sourcePort?: string
  targetPort?: string
  condition?: boolean
}

export interface WorkflowDefinition {
  id: string
  name: string
  version: number
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  createdAt?: string
  updatedAt?: string
}

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
export type NodeExecutionStatus = 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED'

export interface NodeExecutionRecord {
  nodeId: string
  status: NodeExecutionStatus
  input?: JsonValue
  output?: JsonValue
  error?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  attempts: number
}

export interface WorkflowExecution {
  id: string
  workflowId: string
  version: number
  status: ExecutionStatus
  trigger: string
  input?: JsonValue
  output?: JsonValue
  error?: string
  startedAt?: string
  finishedAt?: string
  nodes: NodeExecutionRecord[]
}

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'ai' | 'data'

export interface WorkflowNodeDescriptor {
  type: string
  title: string
  description: string
  category: NodeCategory
  color: string
  icon: string
  configSchema?: JsonObject
  inputSchema?: JsonObject
  outputSchema?: JsonObject
  available?: boolean
}

export interface NodeExecutionContext {
  executionId: string
  /** Live parent Agent selected by the trusted Host caller. */
  agentId?: string
  workflow: WorkflowDefinition
  node: WorkflowNode
  input: JsonValue
  vars: Readonly<JsonObject>
  signal: AbortSignal
  log(message: string, data?: JsonValue): void
}

export interface WorkflowNodeDefinition extends WorkflowNodeDescriptor {
  execute(context: NodeExecutionContext): Promise<JsonValue>
}

export interface ExecuteWorkflowOptions {
  trigger?: string
  input?: JsonValue
  /** Live DSH Agent whose scoped tools and delegation authority own this run. */
  agentId?: string
  signal?: AbortSignal
}

export interface FlowSubagentProviderInfo {
  id: string
  inheritsParentContext: boolean
  capabilities: {
    outputSchema: boolean
    depthLimit: boolean
    toolFilter: boolean
    persona: boolean
  }
}

export interface FlowModelInfo {
  id: string
  name: string
  description?: string
  inputModalities?: string[]
}

export interface FlowModelProviderInfo {
  id: string
  name: string
  models: FlowModelInfo[]
  catalogError?: string
}

/** Live projection of the Harness registries used by Agent-node selectors. */
export interface FlowRuntimeCatalog {
  revision: string
  subagentProviders: FlowSubagentProviderInfo[]
  modelProviders: FlowModelProviderInfo[]
}

export interface FlowConfig {
  apiPrefix?: string
  maxParallelNodes?: number
  defaultTimeoutMs?: number
}

export interface WorkflowValidationIssue {
  code: 'DUPLICATE_NODE' | 'MISSING_NODE' | 'SELF_EDGE' | 'CYCLE' | 'EMPTY_WORKFLOW'
  message: string
  nodeId?: string
}

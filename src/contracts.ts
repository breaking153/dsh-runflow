export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type WorkflowPortType = 'any' | 'json' | 'text' | 'number' | 'boolean' | 'file' | 'files' | 'image' | 'audio' | 'table' | 'error'

export interface WorkflowPortDescriptor {
  id: string
  label?: string
  type: WorkflowPortType
  description?: string
  required?: boolean
  multiple?: boolean
}

/** Explicit envelope used when a node publishes more than one named output. */
export type NodeOutputEnvelope = {
  $runflow: 'port-outputs'
  outputs: JsonObject
}

export interface NodeExecutionLogEntry {
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  data?: JsonValue
}

export interface ExecutionArtifact {
  kind: 'input' | 'output' | 'intermediate' | 'logs' | 'error' | 'manifest'
  label: string
  path: string
  nodeId?: string
  portId?: string
  mediaType: string
  bytes?: number
  preview?: string
}

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
  outputDir?: string
  createdAt?: string
  updatedAt?: string
  published?: boolean
  publishedVersion?: number
  publishedAt?: string
}

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
export type NodeExecutionStatus = 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED'

export interface NodeExecutionRecord {
  nodeId: string
  status: NodeExecutionStatus
  input?: JsonValue
  inputPorts?: JsonObject
  output?: JsonValue
  outputPorts?: JsonObject
  error?: string
  logs?: NodeExecutionLogEntry[]
  artifacts?: ExecutionArtifact[]
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
  outputDir?: string
  artifacts?: ExecutionArtifact[]
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
  inputs?: WorkflowPortDescriptor[]
  outputs?: WorkflowPortDescriptor[]
  available?: boolean
}

export interface NodeExecutionContext {
  executionId: string
  /** Live parent Agent selected by the trusted Host caller. */
  agentId?: string
  workflow: WorkflowDefinition
  node: WorkflowNode
  input: JsonValue
  inputs: Readonly<JsonObject>
  vars: Readonly<JsonObject>
  signal: AbortSignal
  outputDir?: string
  intermediateDir?: string
  log(message: string, data?: JsonValue, level?: NodeExecutionLogEntry['level']): void
  writeIntermediate(label: string, value: JsonValue, portId?: string): Promise<ExecutionArtifact>
}

export interface WorkflowNodeDefinition extends WorkflowNodeDescriptor {
  execute(context: NodeExecutionContext): Promise<JsonValue | NodeOutputEnvelope>
}

export interface ExecuteWorkflowOptions {
  /** Stable id allocated by a Host start call before execution begins. */
  executionId?: string
  trigger?: string
  input?: JsonValue
  /** Live DSH Agent whose scoped tools and delegation authority own this run. */
  agentId?: string
  /** Per-run base directory. A workflow and then plugin default are used when omitted. */
  outputDir?: string
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
  /** Defaults to ~/.dsh_agent_workflow/output. */
  outputDir?: string
  nodesDir?: string
  scriptsDir?: string
  /** Defaults to ~/.dsh_agent_workflow/data/workflows. */
  workflowsDir?: string
  /** Directory containing workspace.json; defaults to ~/.dsh_agent_workflow/data. */
  storageDir?: string
  watchFiles?: boolean
  enableAuthoringTools?: boolean
  authoringPresetId?: string
}

export interface WorkflowValidationIssue {
  code: 'DUPLICATE_NODE' | 'MISSING_NODE' | 'SELF_EDGE' | 'CYCLE' | 'EMPTY_WORKFLOW' | 'UNKNOWN_PORT' | 'PORT_TYPE_MISMATCH' | 'PORT_CARDINALITY'
  message: string
  nodeId?: string
}

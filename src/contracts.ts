export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type WorkflowPortType = 'any' | 'flow' | 'json' | 'text' | 'number' | 'boolean' | 'file' | 'files' | 'image' | 'audio' | 'table' | 'error'

export interface WorkflowPortDescriptor {
  id: string
  label?: string
  type: WorkflowPortType
  description?: string
  required?: boolean
  multiple?: boolean
  /** Declared configuration path supplied by this promoted instance input. */
  configKey?: string
}

/** Explicit envelope used when a node publishes more than one named output. */
export type NodeOutputEnvelope = {
  $runflow: 'port-outputs'
  outputs: JsonObject
}

/** Declarative state updates and routing; never evaluated as source code. */
export type NodeControlEnvelope = {
  $runflow: 'control'
  /** Omitted outputs pass the current input through the first output port. */
  outputs?: JsonObject
  update?: JsonObject
  /** Active output port ids. Empty explicitly ends this branch. */
  routes?: string[]
  /** Finish the entire graph after committing the current super-step. */
  halt?: boolean
  /** Pause at this node boundary; resume may execute the node again. */
  interrupt?: JsonValue
}

export type WorkflowStateReducer = 'replace' | 'append' | 'sum' | 'merge'
export interface WorkflowExecutionConfig {
  mode: 'dag' | 'state-graph'
  /** Omitted retains the original edge-driven execution behavior. */
  semantics?: 'blueprint'
  entryNodeIds?: string[]
  /** Maximum committed super-steps, between 1 and 1000. Defaults to 100. */
  maxSteps?: number
  initialState?: JsonObject
  reducers?: Record<string, WorkflowStateReducer>
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
  /** Declared configuration paths exposed as typed input pins on this instance. */
  promotedInputs?: string[]
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

export interface WorkflowVisualGroup {
  id: string
  label: string
  position: WorkflowPosition
  width: number
  height: number
  nodeIds: string[]
}

export interface WorkflowReroute {
  id: string
  position: WorkflowPosition
}

export interface WorkflowVisualEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface WorkflowSubflowPort {
  id: string
  label: string
  type: WorkflowPortType
  nodeId: string
  nodePortId: string
}

export interface WorkflowSubflowDefinition {
  id: string
  label: string
  position: WorkflowPosition
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  inputs: WorkflowSubflowPort[]
  outputs: WorkflowSubflowPort[]
  groups?: WorkflowVisualGroup[]
  reroutes?: WorkflowReroute[]
  visualEdges?: WorkflowVisualEdge[]
}

/** Editor-only metadata; Host execution consumes the flattened graph above. */
export interface WorkflowUiState {
  schemaVersion: 1
  groups: WorkflowVisualGroup[]
  reroutes: WorkflowReroute[]
  visualEdges: WorkflowVisualEdge[]
  subflows?: WorkflowSubflowDefinition[]
  linksVisible?: boolean
  minimapVisible?: boolean
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
  ui?: WorkflowUiState
  execution?: WorkflowExecutionConfig
}

export type ExecutionStatus = 'PENDING' | 'RUNNING' | 'PAUSED' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
export type NodeExecutionStatus = 'WAITING' | 'RUNNING' | 'PAUSED' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'CANCELLED'

export interface WorkflowCallScope {
  /** One trigger invocation; sibling flow branches retain this identity. */
  id: string
  /** Effect outputs available on this execution path, never shared across calls. */
  outputs: Record<string, JsonObject>
}

export interface WorkflowActivation {
  nodeId: string
  /** Stable definition.edges index, used to distinguish join channels. */
  edgeIndex?: number
  from?: string
  sourcePort?: string
  targetPort?: string
  value: JsonValue
  call?: WorkflowCallScope
}

export interface WorkflowStepRecord {
  step: number
  nodes: NodeExecutionRecord[]
  state: JsonObject
}

/** Persisted only at a completed step boundary. Not an exactly-once guarantee. */
export interface WorkflowGraphCheckpoint {
  schemaVersion: 1
  semantics?: 'blueprint'
  workflowId: string
  workflowVersion: number
  executionId: string
  startedAt?: string
  step: number
  state: JsonObject
  pending: WorkflowActivation[]
  joins: Record<string, WorkflowActivation[]>
  iterations: Record<string, number>
  nodes: NodeExecutionRecord[]
  steps: WorkflowStepRecord[]
  lastOutputs: JsonObject
  lastPortOutputs: Record<string, JsonObject>
  /** Original terminal result before a synthetic completion port was appended. */
  lastTerminalOutputs?: JsonObject
  interrupts: JsonObject
}

export interface NodeExecutionRecord {
  nodeId: string
  callId?: string
  /** Consumer whose arguments demanded this pure visit. */
  evaluatedFor?: string
  step?: number
  iteration?: number
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
  ownerAgentId?: string
  /** Frozen workflow used to resume this execution across Host restarts. */
  definition?: WorkflowDefinition
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
  state?: JsonObject
  step?: number
  steps?: WorkflowStepRecord[]
  checkpoint?: WorkflowGraphCheckpoint
}

export type NodeCategory = 'trigger' | 'action' | 'logic' | 'ai' | 'data'

export interface WorkflowNodeDescriptor {
  type: string
  title: string
  description: string
  category: NodeCategory
  /** Optional ComfyUI-style slash-delimited presentation path, e.g. `DSH/Agents/Research`. */
  group?: string
  color: string
  icon: string
  configSchema?: JsonObject
  inputSchema?: JsonObject
  outputSchema?: JsonObject
  inputs?: WorkflowPortDescriptor[]
  outputs?: WorkflowPortDescriptor[]
  available?: boolean
  /** State graph activation: any message, or one from every incoming edge. */
  activation?: 'any' | 'all'
  /** Blueprint purity must be explicit; undeclared non-trigger providers are effectful. */
  executionKind?: 'trigger' | 'pure' | 'effect'
  /** Declared effect flow output emitted on successful completion when absent. */
  completionPort?: string
}

export interface NodeExecutionContext {
  executionId: string
  callId?: string
  /** Live parent Agent selected by the trusted Host caller. */
  agentId?: string
  workflow: WorkflowDefinition
  node: WorkflowNode
  input: JsonValue
  inputs: Readonly<JsonObject>
  vars: Readonly<JsonObject>
  state?: Readonly<JsonObject>
  step?: number
  iteration?: number
  resume?: { value: JsonValue }
  signal: AbortSignal
  outputDir?: string
  intermediateDir?: string
  log(message: string, data?: JsonValue, level?: NodeExecutionLogEntry['level']): void
  writeIntermediate(label: string, value: JsonValue, portId?: string): Promise<ExecutionArtifact>
}

export interface WorkflowNodeDefinition extends WorkflowNodeDescriptor {
  execute(context: NodeExecutionContext): Promise<JsonValue | NodeOutputEnvelope | NodeControlEnvelope>
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
  /** Trusted caller-selected entry points, e.g. one matching webhook trigger. */
  entryNodeIds?: string[]
  checkpoint?: WorkflowGraphCheckpoint
  /** Answers keyed by interrupted node id; missing answers leave the graph paused. */
  resumeValues?: JsonObject
}

export interface FlowSubagentProviderInfo {
  id: string
  inheritsParentContext: boolean
  capabilities: {
    agentOptions: boolean
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
  contextWindow?: number
  defaultMaxTokens?: number
  reasoning?: {
    efforts: {
      id: string
      name: string
      description?: string
    }[]
    defaultEffort?: string
  }
  resolutionError?: string
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
  /** Install authenticated webhook ingress when the Host has a router. Defaults to true. */
  enableWebhooks?: boolean
  apiPrefix?: string
  maxParallelNodes?: number
  defaultTimeoutMs?: number
  /** Defaults to ~/.dsh_agent_workflow/output. */
  outputDir?: string
  nodesDir?: string
  scriptsDir?: string
  /** Defaults to ~/.dsh_agent_workflow/data/workflows. */
  workflowsDir?: string
  /** Defaults to ~/.dsh_agent_workflow/data/executions. */
  executionsDir?: string
  /** Parent data directory used when repository directories are not explicit. */
  storageDir?: string
  watchFiles?: boolean
  enableAuthoringTools?: boolean
  authoringPresetId?: string
}

export interface WorkflowValidationIssue {
  code: 'DUPLICATE_NODE' | 'MISSING_NODE' | 'SELF_EDGE' | 'CYCLE' | 'EMPTY_WORKFLOW' | 'UNKNOWN_PORT' | 'PORT_TYPE_MISMATCH' | 'PORT_CARDINALITY' | 'INVALID_EXECUTION' | 'INVALID_PROPERTY'
  message: string
  nodeId?: string
}

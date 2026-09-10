import { create } from 'zustand'
import type { RunFlowStartReceipt } from '../remote-contract.ts'
import type { RunFlowGatewayV2, RunFlowClientContext } from './application/runflow-gateway.ts'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react'
import type {
  FlowSubagentProviderInfo, JsonObject, JsonValue, NodeExecutionRecord, NodeExecutionStatus,
  WorkflowDefinition, WorkflowEdge, WorkflowExecution, WorkflowNodeDescriptor, WorkflowPortDescriptor,
  WorkflowSubflowPort, WorkflowUiState,
} from '../contracts.ts'
import { descriptorFor, mergeNodeCatalog, setHostNodeCatalog } from './catalog.tsx'
import {
  createGraphHistory, pasteGraphFragment, pushGraphHistory, readGraphFragment,
  redoGraphHistory, undoGraphHistory, type GraphFragment, type GraphHistory, type GraphSnapshot,
} from './graph-editing.ts'
import { getRunFlowClientContext, getRunFlowGateway } from './runtime.ts'
import { readBrowserStorage, writeBrowserStorage } from './application/browser-storage.ts'
import { createWorkflowPersistenceQueue, sameWorkflowContent, type WorkflowDraft } from './application/workflow-persistence.ts'
import { connectionForNewNode, normalizeNodeConnection, type PendingNodeConnection } from './connection-planning.ts'
import {
  createWorkflowReview,
  type CreateWorkflowReviewOptions,
} from './application/workflow-review.ts'
import {
  createReviewSlice,
  editedReview,
  type ReviewSlice,
  type ReviewSliceSetter,
} from './state/review-slice.ts'

export interface FlowNodeData extends Record<string, unknown> {
  kind?: 'workflow' | 'group' | 'reroute' | 'subflow'
  label: string
  nodeType: string
  description: string
  color: string
  icon: string
  status: NodeExecutionStatus
  config: JsonObject
  inputs: WorkflowPortDescriptor[]
  outputs: WorkflowPortDescriptor[]
  memberNodeIds?: string[]
  subflowId?: string
  executionRecord?: NodeExecutionRecord
}
export type FlowNode = Node<FlowNodeData, 'workflow' | 'runflow-group' | 'runflow-reroute' | 'runflow-subflow'>
export type FlowEdge = Edge
export type FlowView = 'workflows' | 'editor' | 'executions'

export interface FlowSubflow {
  id: string
  label: string
  position: { x: number; y: number }
  nodes: FlowNode[]
  edges: FlowEdge[]
  inputs: WorkflowSubflowPort[]
  outputs: WorkflowSubflowPort[]
}

const STORAGE_KEY = 'dsh-runflow:workspace-draft'
const WORKSPACE_STORAGE_KEY = 'dsh-runflow:workflows'
const OPEN_TABS_KEY = 'dsh-runflow:open-workflow-tabs'
let autosaveTimer: number | undefined
let workspaceRefreshRequest = 0
const workflowPersistence = createWorkflowPersistenceQueue()
const DEFAULT_INPUT: WorkflowPortDescriptor = { id: 'input', label: 'input', type: 'any' }
const DEFAULT_OUTPUT: WorkflowPortDescriptor = { id: 'output', label: 'output', type: 'any' }

export function makeEdge(source: string, target: string, id = source + '-' + target, sourceHandle?: string, targetHandle?: string): FlowEdge {
  return {
    id, source, target,
    ...(sourceHandle === undefined ? {} : { sourceHandle }),
    ...(targetHandle === undefined ? {} : { targetHandle }),
    type: 'smoothstep',
    animated: false,
    style: { stroke: 'var(--dsw-alias-border-strong, #7182aa)', strokeWidth: 1.7 },
  }
}

export function makeNode(id: string, type: string, position: { x: number; y: number }, config: JsonObject = {}, name?: string, descriptorOverride?: WorkflowNodeDescriptor): FlowNode {
  const descriptor = descriptorOverride ?? descriptorFor(type)
  return {
    id, type: 'workflow', position,
    data: {
      label: name ?? descriptor.title,
      kind: 'workflow',
      nodeType: type,
      description: descriptor.description,
      color: descriptor.color,
      icon: descriptor.icon,
      status: 'WAITING',
      config,
      inputs: structuredClone(descriptor.inputs ?? [DEFAULT_INPUT]),
      outputs: structuredClone(descriptor.outputs ?? [DEFAULT_OUTPUT]),
    },
  }
}

function makeGroupNode(id: string, label: string, position: { x: number; y: number }, width: number, height: number, memberNodeIds: string[]): FlowNode {
  return {
    id,
    type: 'runflow-group',
    position,
    zIndex: -1,
    style: { width, height },
    data: {
      kind: 'group', label, memberNodeIds,
      nodeType: '__ui.group', description: 'Visual node group', color: '#4a5fa8', icon: 'workflow',
      status: 'WAITING', config: {}, inputs: [], outputs: [],
    },
  }
}

function makeRerouteNode(id: string, position: { x: number; y: number }): FlowNode {
  return {
    id,
    type: 'runflow-reroute',
    position,
    data: {
      kind: 'reroute', label: 'Reroute', nodeType: '__ui.reroute', description: 'Visual edge reroute',
      color: '#4a5fa8', icon: 'workflow', status: 'WAITING', config: {},
      inputs: [{ id: 'input', type: 'any' }], outputs: [{ id: 'output', type: 'any' }],
    },
  }
}

function makeSubflowNode(subflow: Pick<FlowSubflow, 'id' | 'label' | 'position' | 'inputs' | 'outputs'>): FlowNode {
  return {
    id: subflow.id,
    type: 'runflow-subflow',
    position: subflow.position,
    data: {
      kind: 'subflow', subflowId: subflow.id, label: subflow.label, nodeType: '__ui.subflow',
      description: 'Executable nested RunFlow graph', color: '#4a5fa8', icon: 'workflow', status: 'WAITING', config: {},
      inputs: subflow.inputs.map(port => ({ id: port.id, label: port.label, type: port.type, required: true })),
      outputs: subflow.outputs.map(port => ({ id: port.id, label: port.label, type: port.type })),
    },
  }
}

function defaultDefinition(): WorkflowDefinition {
  return {
    id: 'pr-review-pipeline',
    name: 'PR Review Pipeline',
    version: 1,
    execution: { mode: 'state-graph', maxSteps: 100 },
    nodes: [
      { id: 'manual', type: 'trigger.manual', name: 'Manual Trigger', config: {}, position: { x: 80, y: 220 } },
      { id: 'script', type: 'script.javascript', name: 'JavaScript', config: { code: 'const total = input.items?.length ?? 0\nreturn { ...input, total }', timeoutMs: 5000 }, position: { x: 390, y: 220 } },
      { id: 'agent', type: 'dsh.agent', name: 'DSH Agent', config: { subagentProvider: 'spawn', prompt: 'Review the incoming pull request', maxDepth: 2 }, position: { x: 700, y: 220 } },
      { id: 'storage', type: 'storage.write', name: 'Storage', config: { collection: 'review-results' }, position: { x: 1010, y: 220 } },
    ],
    edges: [
      { id: 'manual-script', from: 'manual', to: 'script', sourcePort: 'output', targetPort: 'input' },
      { id: 'script-agent', from: 'script', to: 'agent', sourcePort: 'output', targetPort: 'input' },
      { id: 'agent-storage', from: 'agent', to: 'storage', sourcePort: 'result', targetPort: 'input' },
    ],
  }
}

function storedWorkflows(): WorkflowDefinition[] {
  try {
    const values = JSON.parse(readBrowserStorage(WORKSPACE_STORAGE_KEY) ?? 'null') as WorkflowDefinition[] | null
    if (Array.isArray(values)) return values.filter(value => value !== null
      && typeof value.id === 'string' && Array.isArray(value.nodes) && Array.isArray(value.edges))
  } catch {}
  try {
    const legacy = JSON.parse(readBrowserStorage(STORAGE_KEY) ?? 'null') as WorkflowDefinition | null
    if (legacy !== null && typeof legacy.id === 'string' && Array.isArray(legacy.nodes) && Array.isArray(legacy.edges)) return [legacy]
  } catch {}
  return []
}

function persistLocalWorkflow(definition: WorkflowDefinition): boolean {
  const workflows = replaceWorkflow(storedWorkflows(), definition)
  const persisted = writeBrowserStorage(WORKSPACE_STORAGE_KEY, JSON.stringify(workflows))
  writeBrowserStorage(STORAGE_KEY, JSON.stringify(definition))
  return persisted
}

function removeLocalWorkflow(id: string): boolean {
  return writeBrowserStorage(WORKSPACE_STORAGE_KEY, JSON.stringify(storedWorkflows().filter(item => item.id !== id)))
}

function storedOpenWorkflowIds(workflows: WorkflowDefinition[]): string[] {
  try {
    const value = JSON.parse(readBrowserStorage(OPEN_TABS_KEY, 'session') ?? '[]') as unknown
    const known = new Set(workflows.map(workflow => workflow.id))
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && known.has(item)) : []
  } catch { return [] }
}

function persistOpenWorkflowIds(ids: string[]): void {
  writeBrowserStorage(OPEN_TABS_KEY, JSON.stringify(ids), 'session')
}

function scheduleAutosave(): void {
  if (typeof window === 'undefined') return
  if (autosaveTimer !== undefined) window.clearTimeout(autosaveTimer)
  const gateway = getRunFlowGateway()
  const agentId = getRunFlowClientContext()?.agentId
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    if (gateway === getRunFlowGateway() && agentId === getRunFlowClientContext()?.agentId) void useFlowStore.getState().save()
  }, 300)
}

function graphOf(definition: WorkflowDefinition): { nodes: FlowNode[]; edges: FlowEdge[]; subflows: FlowSubflow[] } {
  const storedSubflows = definition.ui?.subflows ?? []
  const internalIds = new Set(storedSubflows.flatMap(subflow => subflow.nodes.map(node => node.id)))
  const workflowNodes = definition.nodes.filter(node => !internalIds.has(node.id)).map((node, index) => makeNode(
    node.id, node.type, node.position ?? { x: 80 + index * 300, y: 220 }, node.config, node.name,
  ))
  const subflows: FlowSubflow[] = storedSubflows.map(subflow => {
    const workflowNodes = subflow.nodes.map((node, index) => makeNode(node.id, node.type, node.position ?? { x: 80 + index * 300, y: 220 }, node.config, node.name))
    const groups = (subflow.groups ?? []).map(group => makeGroupNode(group.id, group.label, group.position, group.width, group.height, group.nodeIds))
    const reroutes = (subflow.reroutes ?? []).map(reroute => makeRerouteNode(reroute.id, reroute.position))
    const nodes = [...groups, ...workflowNodes, ...reroutes]
    const nodeMap = new Map(nodes.map(node => [node.id, node]))
    const storedEdges = subflow.visualEdges !== undefined && subflow.visualEdges.length > 0
      ? subflow.visualEdges.map(edge => ({ id: edge.id, from: edge.source, to: edge.target, sourcePort: edge.sourceHandle, targetPort: edge.targetHandle }))
      : subflow.edges
    const edges = storedEdges.flatMap((edge, index) => {
      const source = nodeMap.get(edge.from); const target = nodeMap.get(edge.to)
      if (source === undefined || target === undefined) return []
      return [makeEdge(edge.from, edge.to, edge.id ?? `${subflow.id}-edge-${index}`, edge.sourcePort ?? source.data.outputs[0]?.id, edge.targetPort ?? target.data.inputs[0]?.id)]
    })
    return { id: subflow.id, label: subflow.label, position: subflow.position, nodes, edges, inputs: subflow.inputs, outputs: subflow.outputs }
  })
  const groups = (definition.ui?.groups ?? []).map(group => makeGroupNode(group.id, group.label, group.position, group.width, group.height, group.nodeIds))
  const reroutes = (definition.ui?.reroutes ?? []).map(reroute => makeRerouteNode(reroute.id, reroute.position))
  const proxies = subflows.map(makeSubflowNode)
  const nodes = [...groups, ...workflowNodes, ...reroutes, ...proxies]
  const map = new Map(nodes.map(node => [node.id, node]))
  const storedEdges = definition.ui?.visualEdges !== undefined && definition.ui.visualEdges.length > 0
    ? definition.ui.visualEdges.map(edge => ({ id: edge.id, from: edge.source, to: edge.target, sourcePort: edge.sourceHandle, targetPort: edge.targetHandle }))
    : definition.edges
  const edges = storedEdges.flatMap((edge, index) => {
    const source = map.get(edge.from)
    const target = map.get(edge.to)
    if (source === undefined || target === undefined) return []
    return [makeEdge(edge.from, edge.to, edge.id ?? 'edge-' + index, edge.sourcePort ?? source.data.outputs[0]?.id, edge.targetPort ?? target.data.inputs[0]?.id)]
  })
  return { nodes, edges, subflows }
}

function numericStyle(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function logicalEdges(nodes: FlowNode[], edges: FlowEdge[]): FlowEdge[] {
  const terminals = new Set(nodes.filter(node => node.type === 'workflow' || node.type === 'runflow-subflow').map(node => node.id))
  const reroutes = new Set(nodes.filter(node => node.type === 'runflow-reroute').map(node => node.id))
  const outgoing = new Map<string, FlowEdge[]>()
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge])
  const flattened: FlowEdge[] = []
  for (const first of edges) {
    if (!terminals.has(first.source)) continue
    const walk = (edge: FlowEdge, visited: Set<string>): void => {
      if (terminals.has(edge.target)) {
        flattened.push({
          id: !reroutes.has(first.target) ? first.id : `${first.id}-flat-${flattened.length}`,
          source: first.source,
          target: edge.target,
          ...(first.sourceHandle == null ? {} : { sourceHandle: first.sourceHandle }),
          ...(edge.targetHandle == null ? {} : { targetHandle: edge.targetHandle }),
        })
        return
      }
      if (!reroutes.has(edge.target) || visited.has(edge.target)) return
      const nextVisited = new Set(visited).add(edge.target)
      for (const next of outgoing.get(edge.target) ?? []) walk(next, nextVisited)
    }
    walk(first, new Set())
  }
  return flattened
}

function executableEdges(nodes: FlowNode[], edges: FlowEdge[]): WorkflowEdge[] {
  const executable = new Set(nodes.filter(node => node.type === 'workflow').map(node => node.id))
  return logicalEdges(nodes, edges).filter(edge => executable.has(edge.source) && executable.has(edge.target)).map(edge => ({
    id: edge.id, from: edge.source, to: edge.target,
    ...(edge.sourceHandle == null ? {} : { sourcePort: edge.sourceHandle }),
    ...(edge.targetHandle == null ? {} : { targetPort: edge.targetHandle }),
  }))
}

function storedNodes(nodes: FlowNode[]) {
  return nodes.filter(node => node.type === 'workflow').map(node => ({
    id: node.id, type: node.data.nodeType, name: node.data.label,
    config: node.data.config, position: node.position,
  }))
}

function definitionOf(state: Pick<FlowState, 'workflowId' | 'workflowName' | 'workflowExecution' | 'version' | 'nodes' | 'edges' | 'workflowOutputDir' | 'savedAt' | 'linksVisible' | 'minimapVisible' | 'subflows' | 'activeSubflowId' | 'rootGraphSnapshot'>): WorkflowDefinition {
  const rootNodes = state.rootGraphSnapshot?.nodes ?? state.nodes
  const rootEdges = state.rootGraphSnapshot?.edges ?? state.edges
  const subflows = state.subflows.map(subflow => state.activeSubflowId === subflow.id
    ? { ...subflow, nodes: state.nodes, edges: state.edges }
    : subflow)
  const groups = rootNodes.filter(node => node.type === 'runflow-group').map(node => ({
    id: node.id,
    label: node.data.label,
    position: node.position,
    width: numericStyle(node.style?.width, 360),
    height: numericStyle(node.style?.height, 260),
    nodeIds: node.data.memberNodeIds ?? [],
  }))
  const reroutes = rootNodes.filter(node => node.type === 'runflow-reroute').map(node => ({ id: node.id, position: node.position }))
  const nestedEdges = subflows.flatMap(subflow => executableEdges(subflow.nodes, subflow.edges))
  const rootLogicalEdges = logicalEdges(rootNodes, rootEdges)
  const boundaryEdges: WorkflowEdge[] = []
  for (const edge of rootLogicalEdges) {
    const targetSubflow = subflows.find(subflow => subflow.id === edge.target)
    if (targetSubflow !== undefined && edge.targetHandle != null) {
      const mapping = targetSubflow.inputs.find(port => port.id === edge.targetHandle)
      if (mapping !== undefined) boundaryEdges.push({
        id: `${edge.id}-expanded-input`, from: edge.source, to: mapping.nodeId,
        ...(edge.sourceHandle == null ? {} : { sourcePort: edge.sourceHandle }), targetPort: mapping.nodePortId,
      })
    }
    const sourceSubflow = subflows.find(subflow => subflow.id === edge.source)
    if (sourceSubflow !== undefined && edge.sourceHandle != null) {
      const mapping = sourceSubflow.outputs.find(port => port.id === edge.sourceHandle)
      if (mapping !== undefined) boundaryEdges.push({
        id: `${edge.id}-expanded-output`, from: mapping.nodeId, to: edge.target,
        sourcePort: mapping.nodePortId, ...(edge.targetHandle == null ? {} : { targetPort: edge.targetHandle }),
      })
    }
  }
  const ui: WorkflowUiState = {
    schemaVersion: 1,
    groups,
    reroutes,
    visualEdges: rootEdges.map(edge => ({
      id: edge.id, source: edge.source, target: edge.target,
      ...(edge.sourceHandle == null ? {} : { sourceHandle: edge.sourceHandle }),
      ...(edge.targetHandle == null ? {} : { targetHandle: edge.targetHandle }),
    })),
    linksVisible: state.linksVisible,
    minimapVisible: state.minimapVisible,
    subflows: subflows.map(subflow => ({
      id: subflow.id, label: subflow.label, position: subflow.position,
      nodes: storedNodes(subflow.nodes), edges: executableEdges(subflow.nodes, subflow.edges),
      inputs: subflow.inputs, outputs: subflow.outputs,
      groups: subflow.nodes.filter(node => node.type === 'runflow-group').map(node => ({
        id: node.id, label: node.data.label, position: node.position,
        width: numericStyle(node.style?.width, 360), height: numericStyle(node.style?.height, 260),
        nodeIds: node.data.memberNodeIds ?? [],
      })),
      reroutes: subflow.nodes.filter(node => node.type === 'runflow-reroute').map(node => ({ id: node.id, position: node.position })),
      visualEdges: subflow.edges.map(edge => ({
        id: edge.id, source: edge.source, target: edge.target,
        ...(edge.sourceHandle == null ? {} : { sourceHandle: edge.sourceHandle }),
        ...(edge.targetHandle == null ? {} : { targetHandle: edge.targetHandle }),
      })),
    })),
  }
  return {
    id: state.workflowId,
    name: state.workflowName,
    version: state.version,
    ...(state.workflowExecution === undefined ? {} : { execution: structuredClone(state.workflowExecution) }),
    nodes: [...storedNodes(rootNodes), ...subflows.flatMap(subflow => storedNodes(subflow.nodes))],
    edges: [...executableEdges(rootNodes, rootEdges), ...boundaryEdges, ...nestedEdges],
    ...(state.workflowOutputDir.trim() === '' ? {} : { outputDir: state.workflowOutputDir.trim() }),
    ...(state.savedAt === undefined ? {} : { updatedAt: state.savedAt }),
    ui,
  }
}

function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)) }
function executionRunning(execution: WorkflowExecution): boolean { return execution.status === 'PENDING' || execution.status === 'RUNNING' }
function parseRunInput(source: string): JsonValue {
  const value = JSON.parse(source.trim() || '{}') as unknown
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new Error('invalid JSON')
  return value as JsonValue
}
function replaceWorkflow(list: WorkflowDefinition[], workflow: WorkflowDefinition): WorkflowDefinition[] {
  return [workflow, ...list.filter(item => item.id !== workflow.id)].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}
function draftFrom(definition: WorkflowDefinition) {
  const graph = graphOf(definition)
  return {
    workflowId: definition.id,
    workflowName: definition.name,
    workflowOutputDir: definition.outputDir ?? '',
    workflowExecution: definition.execution === undefined ? undefined : structuredClone(definition.execution),
    version: definition.version,
    savedAt: definition.updatedAt,
    nodes: graph.nodes,
    edges: graph.edges,
    subflows: graph.subflows,
    activeSubflowId: undefined,
    rootGraphSnapshot: undefined,
    selectedNodeId: undefined,
    linksVisible: definition.ui?.linksVisible ?? true,
    minimapVisible: definition.ui?.minimapVisible ?? true,
    graphHistory: createGraphHistory(),
    graphGestureSnapshot: undefined,
    dirty: false,
    saveError: undefined,
    runError: undefined,
  }
}

/** Rebuild a Host-saved definition without discarding transient editor selection or run observability. */
export function restoreSavedEditorState(
  definition: WorkflowDefinition,
  current: Pick<FlowState, 'nodes' | 'edges' | 'selectedNodeId'>,
): Omit<ReturnType<typeof draftFrom>, 'selectedNodeId'> & { selectedNodeId: string | undefined } {
  const restored = draftFrom(definition)
  const previousNodes = new Map(current.nodes.map(node => [node.id, node]))
  const selectedEdges = new Set(current.edges.filter(edge => edge.selected).map(edge => edge.id))
  return {
    ...restored,
    nodes: restored.nodes.map(node => {
      const previous = previousNodes.get(node.id)
      if (previous === undefined) return node
      return {
        ...node,
        ...(previous.selected === undefined ? {} : { selected: previous.selected }),
        data: {
          ...node.data,
          status: previous.data.status,
          ...(previous.data.executionRecord === undefined ? {} : { executionRecord: previous.data.executionRecord }),
        },
      }
    }),
    edges: restored.edges.map(edge => ({ ...edge, selected: selectedEdges.has(edge.id) })),
    selectedNodeId: current.selectedNodeId,
  }
}
const restored = storedWorkflows()
const first = restored[0] ?? defaultDefinition()
const initialGraph = graphOf(first)
const initialOpenWorkflowIds = storedOpenWorkflowIds(restored.length === 0 ? [first] : restored)

export interface FlowState extends ReviewSlice {
  view: FlowView
  workflows: WorkflowDefinition[]
  workflowDrafts: Map<string, WorkflowDraft>
  openWorkflowIds: string[]
  workspaceLoading: boolean
  workspaceError: string | undefined
  nodeCatalog: WorkflowNodeDescriptor[]
  subagentProviders: FlowSubagentProviderInfo[]
  capabilities: {
    creationMode: boolean
    runCode: boolean
    nodeAuthoring: boolean
    sourceAuthoring: boolean
    triggers?: { manual: boolean; agent: boolean; webhook: boolean }
  }
  sourceWorkbenchOpen: boolean
  workflowId: string
  workflowName: string
  workflowOutputDir: string
  workflowExecution: WorkflowDefinition['execution']
  version: number
  nodes: FlowNode[]
  edges: FlowEdge[]
  subflows: FlowSubflow[]
  activeSubflowId: string | undefined
  rootGraphSnapshot: GraphSnapshot | undefined
  selectedNodeId: string | undefined
  linksVisible: boolean
  minimapVisible: boolean
  graphHistory: GraphHistory
  graphClipboard: GraphFragment | undefined
  graphGestureSnapshot: GraphSnapshot | undefined
  selectedExecutionId: string | undefined
  detailsNodeId: string | undefined
  detailsPortId: string | undefined
  executions: WorkflowExecution[]
  running: boolean
  activeExecutionId: string | undefined
  runInput: string
  runError: string | undefined
  dirty: boolean
  savedAt: string | undefined
  saveError: string | undefined
  setView(view: FlowView): void
  setSourceWorkbenchOpen(open: boolean): void
  refreshWorkspace(): Promise<void>
  stageWorkflowReview(candidate: WorkflowDefinition, options: CreateWorkflowReviewOptions): void
  createWorkflow(): void
  openWorkflow(id: string): void
  closeWorkflowTab(id: string): Promise<void>
  reorderWorkflowTabs(sourceId: string, targetId: string): void
  duplicateWorkflow(id: string): void
  deleteWorkflow(id: string): Promise<void>
  onNodesChange(changes: NodeChange<FlowNode>[]): void
  onEdgesChange(changes: EdgeChange<FlowEdge>[]): void
  onConnect(connection: Connection): void
  beginGraphGesture(): void
  endGraphGesture(): void
  undoGraph(): void
  redoGraph(): void
  copySelection(): void
  cutSelection(): void
  pasteSelection(): void
  duplicateSelection(): void
  deleteSelection(): void
  selectAllNodes(): void
  setLinksVisible(visible: boolean): void
  setMinimapVisible(visible: boolean): void
  groupSelection(): void
  ungroupSelection(): void
  insertReroute(edgeId: string, position: { x: number; y: number }): void
  moveGroupChildren(groupId: string, position: { x: number; y: number }): void
  createSubflowFromSelection(): void
  enterSubflow(id: string): void
  exitSubflow(): void
  renameSubflow(id: string, label: string): void
  selectNode(id?: string): void
  openNodeDetails(nodeId: string, portId?: string, executionId?: string): void
  closeNodeDetails(): void
  addNode(descriptor: WorkflowNodeDescriptor, position?: { x: number; y: number }): string
  addConnectedNode(descriptor: WorkflowNodeDescriptor, position: { x: number; y: number }, connection: PendingNodeConnection): string
  updateNode(id: string, patch: Partial<Pick<FlowNodeData, 'label' | 'config'>>): void
  removeNode(id: string): void
  duplicateNode(id: string): void
  setWorkflowName(name: string): void
  setWorkflowOutputDir(outputDir: string): void
  setWorkflowExecution(execution: WorkflowDefinition['execution']): void
  setRunInput(input: string): void
  save(): Promise<void>
  run(nodeId?: string): Promise<void>
  resumeRun(executionId: string, value: JsonValue): Promise<void>
  cancelRun(executionId?: string): Promise<void>
  definition(): WorkflowDefinition
}

function editedDraft(state: Pick<FlowState, 'review'>): Pick<FlowState, 'dirty' | 'review' | 'saveError'> {
  return { dirty: true, review: editedReview(state.review), saveError: undefined }
}

export const useFlowStore = create<FlowState>((set, get) => ({
  ...createReviewSlice(set as unknown as ReviewSliceSetter),
  view: 'workflows',
  workflows: restored.length === 0 ? [first] : restored,
  workflowDrafts: new Map(),
  openWorkflowIds: initialOpenWorkflowIds.length === 0 ? [first.id] : initialOpenWorkflowIds,
  workspaceLoading: false,
  workspaceError: undefined,
  nodeCatalog: mergeNodeCatalog([]),
  subagentProviders: [],
  capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false },
  sourceWorkbenchOpen: false,
  workflowId: first.id,
  workflowName: first.name,
  workflowOutputDir: first.outputDir ?? '',
  workflowExecution: first.execution === undefined ? undefined : structuredClone(first.execution),
  version: first.version,
  nodes: initialGraph.nodes,
  edges: initialGraph.edges,
  subflows: initialGraph.subflows,
  activeSubflowId: undefined,
  rootGraphSnapshot: undefined,
  selectedNodeId: undefined,
  linksVisible: first.ui?.linksVisible ?? true,
  minimapVisible: first.ui?.minimapVisible ?? true,
  graphHistory: createGraphHistory(),
  graphClipboard: undefined,
  graphGestureSnapshot: undefined,
  selectedExecutionId: undefined,
  detailsNodeId: undefined,
  detailsPortId: undefined,
  executions: [],
  running: false,
  activeExecutionId: undefined,
  runInput: '{}',
  runError: undefined,
  dirty: false,
  savedAt: first.updatedAt,
  saveError: undefined,

  setView(view) { set({ view }) },
  setSourceWorkbenchOpen(sourceWorkbenchOpen) { set({ sourceWorkbenchOpen }) },
  stageWorkflowReview(candidate, options) {
    const base = get().definition()
    const review = createWorkflowReview(base, candidate, options)
    set(state => ({
      ...restoreSavedEditorState(candidate, state),
      review,
      inspectorTab: 'review',
      dirty: false,
    }))
  },
  async refreshWorkspace() {
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    if (gateway === undefined || context === undefined) return
    const request = ++workspaceRefreshRequest
    const isCurrent = (): boolean => request === workspaceRefreshRequest
      && gateway === getRunFlowGateway() && context.agentId === getRunFlowClientContext()?.agentId
    set({ workspaceLoading: true, workspaceError: undefined })
    try {
      const workspace = await gateway.workspace.read(context)
      if (!isCurrent()) return
      const nodeCatalog = setHostNodeCatalog(workspace.nodes)
      set(state => {
        let workflows = workspace.workflows.length === 0 ? state.workflows : workspace.workflows
        for (const pending of state.workflowDrafts.values()) workflows = replaceWorkflow(workflows, pending.definition)
        if (state.dirty) workflows = replaceWorkflow(workflows, definitionOf(state))
        return {
          workflows, executions: workspace.executions, nodeCatalog,
          subagentProviders: workspace.subagentProviders,
          capabilities: workspace.capabilities, workspaceLoading: false,
        }
      })
      writeBrowserStorage(WORKSPACE_STORAGE_KEY, JSON.stringify(get().workflows))
    } catch (error) {
      if (!isCurrent()) return
      set({ workspaceLoading: false, workspaceError: error instanceof Error ? error.message : String(error) })
    }
  },
  createWorkflow() {
    if (get().dirty) void get().save()
    const id = 'workflow-' + Date.now().toString(36)
    const definition: WorkflowDefinition = {
      id, name: 'My workflow', version: 1,
      execution: { mode: 'state-graph', maxSteps: 100 },
      nodes: [{ id: 'manual-' + Date.now().toString(36), type: 'trigger.manual', name: 'Manual Trigger', config: {}, position: { x: 180, y: 240 } }],
      edges: [],
    }
    set(state => {
      const openWorkflowIds = [...state.openWorkflowIds.filter(item => item !== id), id]
      persistOpenWorkflowIds(openWorkflowIds)
      return { ...draftFrom(definition), view: 'editor', workflows: replaceWorkflow(state.workflows, definition), openWorkflowIds, review: undefined, inspectorTab: undefined, dirty: true }
    })
    void get().save()
  },
  openWorkflow(id) {
    const current = get()
    const known = current.workflows.find(item => item.id === id)
    if (known === undefined && !current.workflowDrafts.has(id)) return
    if (current.workflowId === id && (current.dirty || (current.version === known?.version && current.savedAt === known?.updatedAt))) {
      const openWorkflowIds = current.openWorkflowIds.includes(id) ? current.openWorkflowIds : [...current.openWorkflowIds, id]
      persistOpenWorkflowIds(openWorkflowIds)
      set({ view: 'editor', openWorkflowIds })
      return
    }
    if (current.dirty) void get().save()
    const pending = get().workflowDrafts.get(id)
    const definition = pending?.definition ?? get().workflows.find(item => item.id === id)
    if (definition === undefined) return
    set(state => {
      const openWorkflowIds = state.openWorkflowIds.includes(id) ? state.openWorkflowIds : [...state.openWorkflowIds, id]
      persistOpenWorkflowIds(openWorkflowIds)
      return { ...draftFrom(definition), dirty: pending !== undefined, saveError: pending?.error, view: 'editor', openWorkflowIds, review: undefined, inspectorTab: undefined }
    })
  },
  async closeWorkflowTab(id) {
    const state = get()
    if (!state.openWorkflowIds.includes(id)) return
    if (state.workflowId === id && state.dirty) await get().save()
    const current = get()
    if ((current.workflowId === id && current.dirty) || current.workflowDrafts.has(id)) return
    const index = current.openWorkflowIds.indexOf(id)
    const openWorkflowIds = current.openWorkflowIds.filter(item => item !== id)
    if (openWorkflowIds.length === 0) {
      set({ openWorkflowIds: [] })
      persistOpenWorkflowIds([])
      get().createWorkflow()
      return
    }
    persistOpenWorkflowIds(openWorkflowIds)
    if (current.workflowId !== id) { set({ openWorkflowIds }); return }
    const target = openWorkflowIds[Math.min(index, openWorkflowIds.length - 1)]
    set({ openWorkflowIds })
    if (target !== undefined) get().openWorkflow(target)
  },
  reorderWorkflowTabs(sourceId, targetId) {
    set(state => {
      const sourceIndex = state.openWorkflowIds.indexOf(sourceId)
      const targetIndex = state.openWorkflowIds.indexOf(targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return state
      const openWorkflowIds = [...state.openWorkflowIds]
      const [source] = openWorkflowIds.splice(sourceIndex, 1)
      if (source === undefined) return state
      openWorkflowIds.splice(targetIndex, 0, source)
      persistOpenWorkflowIds(openWorkflowIds)
      return { openWorkflowIds }
    })
  },
  duplicateWorkflow(id) {
    if (get().dirty) void get().save()
    const source = get().workflows.find(item => item.id === id)
    if (source === undefined) return
    const now = Date.now().toString(36)
    const copy: WorkflowDefinition = { ...structuredClone(source), id: source.id + '-copy-' + now, name: source.name + ' copy', version: 1 }
    delete copy.createdAt; delete copy.updatedAt
    set(state => {
      const openWorkflowIds = [...state.openWorkflowIds.filter(item => item !== copy.id), copy.id]
      persistOpenWorkflowIds(openWorkflowIds)
      return { ...draftFrom(copy), view: 'editor', workflows: replaceWorkflow(state.workflows, copy), openWorkflowIds, review: undefined, inspectorTab: undefined, dirty: true }
    })
    void get().save()
  },
  async deleteWorkflow(id) {
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    const isCurrent = (): boolean => gateway === getRunFlowGateway() && context?.agentId === getRunFlowClientContext()?.agentId
    set({ workspaceError: undefined })
    try {
      if (gateway !== undefined && context !== undefined) {
        await workflowPersistence.delete(gateway, context, id, isCurrent)
        if (!isCurrent()) return
      }
      const locallyRemoved = removeLocalWorkflow(id)
      if (!locallyRemoved && (gateway === undefined || context === undefined)) {
        throw new Error('Browser storage is unavailable. Reconnect to DSH to delete this workflow.')
      }
      set(state => {
        const openWorkflowIds = state.openWorkflowIds.filter(item => item !== id)
        const workflowDrafts = new Map(state.workflowDrafts)
        workflowDrafts.delete(id)
        persistOpenWorkflowIds(openWorkflowIds)
        return {
          workflows: state.workflows.filter(item => item.id !== id), workflowDrafts, openWorkflowIds,
          executions: state.executions.filter(item => item.workflowId !== id), view: 'workflows',
          ...(state.workflowId === id ? { dirty: false, saveError: undefined } : {}),
        }
      })
    } catch (error) {
      if (!isCurrent()) return
      set({ workspaceError: error instanceof Error ? error.message : String(error) })
      if (get().workflowId === id && get().dirty) scheduleAutosave()
    }
  },
  onNodesChange(changes) {
    const meaningful = changes.some(change => change.type === 'position' || change.type === 'remove' || change.type === 'add')
    const structural = changes.some(change => change.type === 'remove' || change.type === 'add')
    set(state => ({
      ...(structural ? { graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }) } : {}),
      nodes: applyNodeChanges(changes, state.nodes),
      ...(meaningful ? editedDraft(state) : {}),
    }))
    if (meaningful) scheduleAutosave()
  },
  onEdgesChange(changes) {
    const meaningful = changes.some(change => change.type === 'remove' || change.type === 'add' || change.type === 'replace')
    set(state => ({
      ...(meaningful ? { graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }) } : {}),
      edges: applyEdgeChanges(changes, state.edges),
      ...(meaningful ? editedDraft(state) : {}),
    }))
    if (meaningful) scheduleAutosave()
  },
  onConnect(connection) {
    const state = get()
    const normalized = normalizeNodeConnection(state.nodes, connection, { mode: state.workflowExecution?.mode ?? 'dag', edges: state.edges })
    if (normalized === undefined) return
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      edges: addEdge({ ...normalized, type: 'smoothstep', style: { stroke: 'var(--dsw-alias-border-strong, #7182aa)', strokeWidth: 1.7 } }, state.edges),
      ...editedDraft(state),
    }))
    scheduleAutosave()
  },
  beginGraphGesture() {
    if (get().graphGestureSnapshot !== undefined) return
    set(state => ({ graphGestureSnapshot: structuredClone({ nodes: state.nodes, edges: state.edges }) }))
  },
  endGraphGesture() {
    set(state => {
      if (state.graphGestureSnapshot === undefined) return state
      const before = state.graphGestureSnapshot
      const changed = before.nodes.some((node, index) => {
        const current = state.nodes[index]
        return current === undefined || current.id !== node.id || current.position.x !== node.position.x || current.position.y !== node.position.y
      })
      return {
        graphGestureSnapshot: undefined,
        ...(changed ? { graphHistory: pushGraphHistory(state.graphHistory, before), ...editedDraft(state) } : {}),
      }
    })
    scheduleAutosave()
  },
  undoGraph() {
    set(state => {
      if (state.graphHistory.past.length === 0) return state
      const step = undoGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges })
      return {
        ...step.snapshot,
        graphHistory: step.history,
        graphGestureSnapshot: undefined,
        selectedNodeId: step.snapshot.nodes.find(node => node.selected)?.id,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  redoGraph() {
    set(state => {
      if (state.graphHistory.future.length === 0) return state
      const step = redoGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges })
      return {
        ...step.snapshot,
        graphHistory: step.history,
        graphGestureSnapshot: undefined,
        selectedNodeId: step.snapshot.nodes.find(node => node.selected)?.id,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  copySelection() {
    const state = get()
    const graphClipboard = readGraphFragment(state.nodes, state.edges, state.selectedNodeId)
    if (graphClipboard.nodes.length > 0) set({ graphClipboard })
  },
  cutSelection() {
    get().copySelection()
    get().deleteSelection()
  },
  pasteSelection() {
    set(state => {
      if (state.graphClipboard === undefined || state.graphClipboard.nodes.length === 0) return state
      const pasted = pasteGraphFragment(state.graphClipboard, state.nodes, state.edges)
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: [...state.nodes.map(node => ({ ...node, selected: false })), ...pasted.nodes],
        edges: [...state.edges.map(edge => ({ ...edge, selected: false })), ...pasted.edges],
        selectedNodeId: pasted.nodes[0]?.id,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  duplicateSelection() {
    get().copySelection()
    get().pasteSelection()
  },
  deleteSelection() {
    set(state => {
      const ids = new Set(state.nodes.filter(node => node.selected || node.id === state.selectedNodeId).map(node => node.id))
      const edgeIds = new Set(state.edges.filter(edge => edge.selected).map(edge => edge.id))
      if (ids.size === 0 && edgeIds.size === 0) return state
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: state.nodes.filter(node => !ids.has(node.id)),
        edges: state.edges.filter(edge => !edgeIds.has(edge.id) && !ids.has(edge.source) && !ids.has(edge.target)),
        subflows: state.subflows.filter(subflow => !ids.has(subflow.id)),
        selectedNodeId: undefined,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  selectAllNodes() {
    set(state => ({ nodes: state.nodes.map(node => ({ ...node, selected: true })), selectedNodeId: state.nodes[0]?.id }))
  },
  setLinksVisible(linksVisible) { set(state => ({ linksVisible, ...editedDraft(state) })); scheduleAutosave() },
  setMinimapVisible(minimapVisible) { set(state => ({ minimapVisible, ...editedDraft(state) })); scheduleAutosave() },
  groupSelection() {
    set(state => {
      const members = state.nodes.filter(node => node.type === 'workflow' && node.selected)
      if (members.length < 2) return state
      const left = Math.min(...members.map(node => node.position.x))
      const top = Math.min(...members.map(node => node.position.y))
      const right = Math.max(...members.map(node => node.position.x + (node.measured?.width ?? 244)))
      const bottom = Math.max(...members.map(node => node.position.y + (node.measured?.height ?? 170)))
      const id = 'group-' + Math.random().toString(36).slice(2, 8)
      const group = makeGroupNode(id, 'Node group', { x: left - 34, y: top - 52 }, right - left + 68, bottom - top + 86, members.map(node => node.id))
      group.selected = true
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: [group, ...state.nodes.map(node => ({ ...node, selected: false }))],
        selectedNodeId: id,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  ungroupSelection() {
    set(state => {
      const ids = new Set(state.nodes.filter(node => node.type === 'runflow-group' && node.selected).map(node => node.id))
      if (ids.size === 0) return state
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: state.nodes.filter(node => !ids.has(node.id)),
        selectedNodeId: undefined,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  insertReroute(edgeId, position) {
    set(state => {
      const edge = state.edges.find(item => item.id === edgeId)
      if (edge === undefined) return state
      const id = 'reroute-' + Math.random().toString(36).slice(2, 8)
      const reroute = { ...makeRerouteNode(id, position), selected: true }
      const first = makeEdge(edge.source, id, `${edge.id}-in`, edge.sourceHandle ?? undefined, 'input')
      const second = makeEdge(id, edge.target, `${edge.id}-out`, 'output', edge.targetHandle ?? undefined)
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: [...state.nodes.map(node => ({ ...node, selected: false })), reroute],
        edges: [...state.edges.filter(item => item.id !== edgeId), first, second],
        selectedNodeId: id,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  moveGroupChildren(groupId, position) {
    set(state => {
      const start = state.graphGestureSnapshot
      const group = start?.nodes.find(node => node.id === groupId && node.type === 'runflow-group')
      if (start === undefined || group === undefined) return state
      const dx = position.x - group.position.x
      const dy = position.y - group.position.y
      const members = new Set(group.data.memberNodeIds ?? [])
      const originals = new Map(start.nodes.map(node => [node.id, node]))
      return {
        nodes: state.nodes.map(node => {
          if (node.id === groupId) return { ...node, position }
          if (!members.has(node.id)) return node
          const original = originals.get(node.id)
          return original === undefined ? node : { ...node, position: { x: original.position.x + dx, y: original.position.y + dy } }
        }),
      }
    })
  },
  createSubflowFromSelection() {
    set(state => {
      if (state.activeSubflowId !== undefined) return state
      const members = state.nodes.filter(node => node.type === 'workflow' && node.selected)
      if (members.length < 2) return state
      const memberIds = new Set(members.map(node => node.id))
      const internalEdges = state.edges.filter(edge => memberIds.has(edge.source) && memberIds.has(edge.target))
      const incoming = state.edges.filter(edge => !memberIds.has(edge.source) && memberIds.has(edge.target))
      const outgoing = state.edges.filter(edge => memberIds.has(edge.source) && !memberIds.has(edge.target))
      const inputs: WorkflowSubflowPort[] = incoming.map((edge, index) => {
        const target = state.nodes.find(node => node.id === edge.target)
        const port = target?.data.inputs.find(item => item.id === edge.targetHandle)
        return { id: `input-${index + 1}`, label: port?.label ?? port?.id ?? `Input ${index + 1}`, type: port?.type ?? 'any', nodeId: edge.target, nodePortId: edge.targetHandle ?? port?.id ?? 'input' }
      })
      const outputs: WorkflowSubflowPort[] = outgoing.map((edge, index) => {
        const source = state.nodes.find(node => node.id === edge.source)
        const port = source?.data.outputs.find(item => item.id === edge.sourceHandle)
        return { id: `output-${index + 1}`, label: port?.label ?? port?.id ?? `Output ${index + 1}`, type: port?.type ?? 'any', nodeId: edge.source, nodePortId: edge.sourceHandle ?? port?.id ?? 'output' }
      })
      const left = Math.min(...members.map(node => node.position.x))
      const top = Math.min(...members.map(node => node.position.y))
      const id = 'subflow-' + Math.random().toString(36).slice(2, 8)
      const subflow: FlowSubflow = {
        id, label: 'Subflow', position: { x: left, y: top },
        nodes: structuredClone(members).map(node => ({ ...node, selected: false })),
        edges: structuredClone(internalEdges).map(edge => ({ ...edge, selected: false })), inputs, outputs,
      }
      const proxy = { ...makeSubflowNode(subflow), selected: true }
      const boundary = [
        ...incoming.map((edge, index) => makeEdge(edge.source, id, edge.id, edge.sourceHandle ?? undefined, inputs[index]?.id)),
        ...outgoing.map((edge, index) => makeEdge(id, edge.target, edge.id, outputs[index]?.id, edge.targetHandle ?? undefined)),
      ]
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: [...state.nodes.filter(node => !memberIds.has(node.id)).map(node => ({ ...node, selected: false })), proxy],
        edges: [...state.edges.filter(edge => !memberIds.has(edge.source) && !memberIds.has(edge.target)), ...boundary],
        subflows: [...state.subflows, subflow], selectedNodeId: id, ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  enterSubflow(id) {
    set(state => {
      if (state.activeSubflowId !== undefined) return state
      const subflow = state.subflows.find(item => item.id === id)
      if (subflow === undefined) return state
      return {
        rootGraphSnapshot: structuredClone({ nodes: state.nodes, edges: state.edges }),
        activeSubflowId: id,
        nodes: structuredClone(subflow.nodes),
        edges: structuredClone(subflow.edges),
        selectedNodeId: undefined,
        graphHistory: createGraphHistory(),
      }
    })
  },
  exitSubflow() {
    set(state => {
      if (state.activeSubflowId === undefined || state.rootGraphSnapshot === undefined) return state
      const subflows = state.subflows.map(subflow => subflow.id === state.activeSubflowId
        ? { ...subflow, nodes: structuredClone(state.nodes), edges: structuredClone(state.edges) }
        : subflow)
      return {
        ...structuredClone(state.rootGraphSnapshot), subflows,
        activeSubflowId: undefined, rootGraphSnapshot: undefined,
        selectedNodeId: undefined, graphHistory: createGraphHistory(), ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  renameSubflow(id, label) {
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      subflows: state.subflows.map(subflow => subflow.id === id ? { ...subflow, label } : subflow),
      nodes: state.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, label } } : node),
      ...editedDraft(state),
    }))
    scheduleAutosave()
  },
  selectNode(id) { set({ selectedNodeId: id }) },
  openNodeDetails(nodeId, portId, executionId) { set(state => ({ detailsNodeId: nodeId, detailsPortId: portId, selectedExecutionId: executionId ?? state.executions[0]?.id })) },
  closeNodeDetails() { set({ detailsNodeId: undefined, detailsPortId: undefined }) },
  addNode(descriptor, position = { x: 460, y: 340 }) {
    const id = descriptor.type.replaceAll('.', '-') + '-' + Math.random().toString(36).slice(2, 7)
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      nodes: [...state.nodes.map(node => ({ ...node, selected: false })), { ...makeNode(id, descriptor.type, position, {}, undefined, descriptor), selected: true }],
      selectedNodeId: id,
      ...editedDraft(state),
    }))
    scheduleAutosave()
    return id
  },
  addConnectedNode(descriptor, position, pending) {
    const id = descriptor.type.replaceAll('.', '-') + '-' + Math.random().toString(36).slice(2, 7)
    const created = { ...makeNode(id, descriptor.type, position, {}, undefined, descriptor), selected: true }
    const connection = connectionForNewNode(pending, descriptor, id)
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      nodes: [...state.nodes.map(node => ({ ...node, selected: false })), created],
      edges: connection === undefined ? state.edges : [...state.edges, makeEdge(
        connection.source,
        connection.target,
        `edge-${connection.source}-${connection.target}-${Math.random().toString(36).slice(2, 7)}`,
        connection.sourceHandle ?? undefined,
        connection.targetHandle ?? undefined,
      )],
      selectedNodeId: id,
      ...editedDraft(state),
    }))
    scheduleAutosave()
    return id
  },
  updateNode(id, patch) {
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      nodes: state.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node),
      ...editedDraft(state),
    }))
    scheduleAutosave()
  },
  removeNode(id) {
    set(state => {
      const removed = state.nodes.find(node => node.id === id)
      return {
        graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
        nodes: state.nodes.filter(node => node.id !== id),
        edges: state.edges.filter(edge => edge.source !== id && edge.target !== id),
        subflows: removed?.type === 'runflow-subflow' ? state.subflows.filter(subflow => subflow.id !== id) : state.subflows,
        selectedNodeId: state.selectedNodeId === id ? undefined : state.selectedNodeId,
        detailsNodeId: state.detailsNodeId === id ? undefined : state.detailsNodeId,
        ...editedDraft(state),
      }
    })
    scheduleAutosave()
  },
  duplicateNode(id) {
    const source = get().nodes.find(node => node.id === id)
    if (source === undefined) return
    const copy = structuredClone(source)
    const copyId = id + '-copy-' + Math.random().toString(36).slice(2, 5)
    delete copy.data.executionRecord
    set(state => ({
      graphHistory: pushGraphHistory(state.graphHistory, { nodes: state.nodes, edges: state.edges }),
      nodes: [...state.nodes.map(node => ({ ...node, selected: false })), { ...copy, id: copyId, position: { x: source.position.x + 36, y: source.position.y + 36 }, selected: true, data: { ...copy.data, status: 'WAITING' } }],
      selectedNodeId: copyId,
      ...editedDraft(state),
    }))
    scheduleAutosave()
  },
  setWorkflowName(workflowName) { set(state => ({ workflowName, ...editedDraft(state) })); scheduleAutosave() },
  setWorkflowOutputDir(workflowOutputDir) { set(state => ({ workflowOutputDir, ...editedDraft(state) })); scheduleAutosave() },
  setWorkflowExecution(workflowExecution) { set(state => ({ workflowExecution, ...editedDraft(state) })); scheduleAutosave() },
  setRunInput(runInput) { set({ runInput, runError: undefined }) },
  async save() {
    if (autosaveTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(autosaveTimer)
      autosaveTimer = undefined
    }
    const state = get()
    if (!state.dirty) return
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    if (!state.workflows.some(workflow => workflow.id === state.workflowId)) return
    if (gateway !== undefined && context !== undefined && workflowPersistence.isDeleting(gateway, context, state.workflowId)) return
    const isCurrent = (): boolean => gateway === getRunFlowGateway() && context?.agentId === getRunFlowClientContext()?.agentId
    const draft = definitionOf(state)
    // Keep an in-memory copy before navigation can replace the active editor.
    set(current => ({
      workflows: replaceWorkflow(current.workflows, draft),
      workflowDrafts: new Map(current.workflowDrafts).set(draft.id, { definition: draft }),
    }))
    try {
      const locallyPersisted = persistLocalWorkflow(draft)
      if (gateway === undefined || context === undefined) {
        if (!locallyPersisted) throw new Error('Browser storage is unavailable. Keep this workflow open and reconnect to DSH to save it.')
        const savedAt = new Date().toISOString()
        set(current => {
          const workflowDrafts = new Map(current.workflowDrafts)
          workflowDrafts.delete(draft.id)
          return { savedAt, dirty: false, saveError: undefined, workflowDrafts, workflows: replaceWorkflow(current.workflows, { ...draft, updatedAt: savedAt }) }
        })
        return
      }
      const operation = workflowPersistence.save(gateway, context, draft, isCurrent)
      const saved = await operation
      if (saved === undefined || !isCurrent()) return
      const latest = get()
      if (!latest.workflows.some(workflow => workflow.id === draft.id)) return
      const latestDraft = latest.workflowId === draft.id
        ? definitionOf(latest)
        : latest.workflowDrafts.get(draft.id)?.definition
      if (latestDraft !== undefined && (!sameWorkflowContent(latestDraft, draft)
        || workflowPersistence.hasLaterOperation(gateway, context, draft.id, operation))) {
        // Even matching content is not durable while a later queued write can still replace it.
        const pending = { ...latestDraft, version: saved.version, ...(saved.updatedAt === undefined ? {} : { updatedAt: saved.updatedAt }) }
        persistLocalWorkflow(pending)
        set(current => ({
          workflows: replaceWorkflow(current.workflows, pending),
          workflowDrafts: new Map(current.workflowDrafts).set(draft.id, { definition: pending }),
          ...(current.workflowId === draft.id ? { version: saved.version, savedAt: saved.updatedAt, dirty: true } : {}),
        }))
        if (latest.workflowId === draft.id) scheduleAutosave()
        return
      }
      persistLocalWorkflow(saved)
      set(current => {
        const workflowDrafts = new Map(current.workflowDrafts)
        workflowDrafts.delete(draft.id)
        return {
          workflows: replaceWorkflow(current.workflows, saved), workflowDrafts,
          ...(current.workflowId === draft.id ? { version: saved.version, savedAt: saved.updatedAt, dirty: false, saveError: undefined } : {}),
        }
      })
    } catch (error) {
      if (!isCurrent()) return
      const saveError = error instanceof Error ? error.message : String(error)
      set(current => {
        const pending = current.workflowDrafts.get(draft.id)
        if (pending === undefined || !sameWorkflowContent(pending.definition, draft)) return current
        return {
          workflowDrafts: new Map(current.workflowDrafts).set(draft.id, { ...pending, error: saveError }),
          ...(current.workflowId === draft.id ? { saveError } : {}),
        }
      })
    }
  },
  async run(nodeId) {
    if (get().running) return
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    if (gateway === undefined || context === undefined) { set({ runError: 'Open a DSH main session before running this workflow.' }); return }
    let input: JsonValue
    try { input = parseRunInput(get().runInput) } catch (error) { set({ runError: 'Invalid run input JSON: ' + (error instanceof Error ? error.message : String(error)) }); return }
    const workflowId = get().workflowId
    if (get().dirty) await get().save()
    if (gateway !== getRunFlowGateway() || context.agentId !== getRunFlowClientContext()?.agentId || get().workflowId !== workflowId) return
    if (get().dirty) {
      set({ runError: get().saveError ?? 'Save the workflow before executing it.' })
      return
    }
    set(state => ({ running: true, activeExecutionId: undefined, runError: undefined, nodes: state.nodes.map(node => nodeId === undefined || node.id === nodeId ? { ...node, data: { ...node.data, status: 'WAITING' } } : node) }))
    try {
      const definition = get().definition()
      const receipt = await gateway.executions.start(context, { definition, input, ...(definition.outputDir === undefined ? {} : { outputDir: definition.outputDir }), ...(nodeId === undefined ? {} : { targetNodeId: nodeId }) })
      await followExecution(receipt, gateway, context)
    } catch (error) { if (gateway === getRunFlowGateway() && context.agentId === getRunFlowClientContext()?.agentId && get().workflowId === workflowId) set({ running: false, activeExecutionId: undefined, runError: error instanceof Error ? error.message : String(error) }) }
  },
  async resumeRun(executionId, value) {
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    if (gateway === undefined || context === undefined) { set({ runError: 'Open a DSH main session before resuming.' }); return }
    set({ runError: undefined })
    try {
      const receipt = await gateway.executions.resume(context, executionId, value)
      await followExecution(receipt, gateway, context)
    } catch (error) {
      if (gateway === getRunFlowGateway() && context.agentId === getRunFlowClientContext()?.agentId) set({ running: false, runError: error instanceof Error ? error.message : String(error) })
    }
  },
  async cancelRun(requestedExecutionId) {
    const gateway = getRunFlowGateway()
    const context = getRunFlowClientContext()
    const executionId = requestedExecutionId ?? get().activeExecutionId
    if (gateway === undefined || context === undefined || executionId === undefined) return
    try {
      if (!await gateway.executions.cancel(context, executionId)) set({ runError: 'This execution has already finished.' })
      else { const execution = await gateway.executions.read(context, executionId); if (execution !== null) await followExecution({ executionId, execution }, gateway, context) }
    }
    catch (error) { set({ runError: error instanceof Error ? error.message : String(error) }) }
  },
  definition() { return definitionOf(get()) },
}))

async function followExecution(receipt: RunFlowStartReceipt, gateway: RunFlowGatewayV2, context: RunFlowClientContext): Promise<void> {
  const isCurrent = (): boolean => gateway === getRunFlowGateway() && context.agentId === getRunFlowClientContext()?.agentId
  let execution = receipt.execution
  while (isCurrent()) {
    useFlowStore.setState(state => {
      const records = new Map(execution.nodes.map(record => [record.nodeId, record]))
      return {
        executions: [execution, ...state.executions.filter(item => item.id !== execution.id)],
        ...(state.workflowId !== execution.workflowId ? {} : {
          selectedExecutionId: execution.id,
          activeExecutionId: executionRunning(execution) || execution.status === 'PAUSED' ? execution.id : undefined,
          running: executionRunning(execution),
          nodes: state.nodes.map(node => { const record = records.get(node.id); return record === undefined ? node : { ...node, data: { ...node.data, status: record.status, executionRecord: record } } }),
        }),
      }
    })
    if (!executionRunning(execution)) return
    await delay(300)
    if (!isCurrent()) return
    const next = await gateway.executions.read(context, receipt.executionId)
    if (next === null) throw new Error('Host execution not found: ' + receipt.executionId)
    execution = next
  }
}

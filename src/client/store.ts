import { create } from 'zustand'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react'
import type {
  JsonObject, JsonValue, NodeExecutionRecord, NodeExecutionStatus,
  WorkflowDefinition, WorkflowExecution, WorkflowNodeDescriptor, WorkflowPortDescriptor,
} from '../contracts.ts'
import { descriptorFor, mergeNodeCatalog, setHostNodeCatalog } from './catalog.tsx'
import { getFlowRuntime } from './runtime.ts'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  description: string
  color: string
  icon: string
  status: NodeExecutionStatus
  config: JsonObject
  inputs: WorkflowPortDescriptor[]
  outputs: WorkflowPortDescriptor[]
  executionRecord?: NodeExecutionRecord
}
export type FlowNode = Node<FlowNodeData, 'workflow'>
export type FlowEdge = Edge
export type FlowView = 'workflows' | 'editor' | 'executions'

const STORAGE_KEY = 'dsh-runflow:workspace-draft'
const WORKSPACE_STORAGE_KEY = 'dsh-runflow:workflows'
let autosaveTimer: number | undefined
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

export function makeNode(id: string, type: string, position: { x: number; y: number }, config: JsonObject = {}, name?: string): FlowNode {
  const descriptor = descriptorFor(type)
  return {
    id, type: 'workflow', position,
    data: {
      label: name ?? descriptor.title,
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

function defaultDefinition(): WorkflowDefinition {
  return {
    id: 'pr-review-pipeline',
    name: 'PR Review Pipeline',
    version: 1,
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
  if (typeof localStorage === 'undefined') return []
  try {
    const values = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY) ?? '[]') as WorkflowDefinition[]
    if (Array.isArray(values)) return values.filter(value => value !== null
      && typeof value.id === 'string' && Array.isArray(value.nodes) && Array.isArray(value.edges))
  } catch {}
  try {
    const legacy = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as WorkflowDefinition | null
    if (legacy !== null && typeof legacy.id === 'string' && Array.isArray(legacy.nodes) && Array.isArray(legacy.edges)) return [legacy]
  } catch {}
  return []
}

function persistLocalWorkflow(definition: WorkflowDefinition): void {
  if (typeof localStorage === 'undefined') return
  const workflows = replaceWorkflow(storedWorkflows(), definition)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(definition))
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workflows))
}

function removeLocalWorkflow(id: string): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(storedWorkflows().filter(item => item.id !== id)))
}

function scheduleAutosave(): void {
  if (typeof window === 'undefined') return
  if (autosaveTimer !== undefined) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = undefined
    void useFlowStore.getState().save()
  }, 650)
}

function graphOf(definition: WorkflowDefinition): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes = definition.nodes.map((node, index) => makeNode(
    node.id, node.type, node.position ?? { x: 80 + index * 300, y: 220 }, node.config, node.name,
  ))
  const map = new Map(nodes.map(node => [node.id, node]))
  const edges = definition.edges.flatMap((edge, index) => {
    const source = map.get(edge.from)
    const target = map.get(edge.to)
    if (source === undefined || target === undefined) return []
    return [makeEdge(edge.from, edge.to, edge.id ?? 'edge-' + index, edge.sourcePort ?? source.data.outputs[0]?.id, edge.targetPort ?? target.data.inputs[0]?.id)]
  })
  return { nodes, edges }
}

function definitionOf(state: Pick<FlowState, 'workflowId' | 'workflowName' | 'version' | 'nodes' | 'edges' | 'workflowOutputDir' | 'savedAt' | 'published'>): WorkflowDefinition {
  return {
    id: state.workflowId,
    name: state.workflowName,
    version: state.version,
    nodes: state.nodes.map(node => ({
      id: node.id, type: node.data.nodeType, name: node.data.label,
      config: node.data.config, position: node.position,
    })),
    edges: state.edges.map(edge => ({
      id: edge.id, from: edge.source, to: edge.target,
      ...(edge.sourceHandle == null ? {} : { sourcePort: edge.sourceHandle }),
      ...(edge.targetHandle == null ? {} : { targetPort: edge.targetHandle }),
    })),
    ...(state.workflowOutputDir.trim() === '' ? {} : { outputDir: state.workflowOutputDir.trim() }),
    ...(state.savedAt === undefined ? {} : { updatedAt: state.savedAt }),
    published: state.published,
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
    version: definition.version,
    published: definition.published ?? false,
    savedAt: definition.updatedAt,
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeId: undefined,
    dirty: false,
    saveError: undefined,
    runError: undefined,
  }
}
const restored = storedWorkflows()
const first = restored[0] ?? defaultDefinition()
const initialGraph = graphOf(first)

interface FlowState {
  view: FlowView
  workflows: WorkflowDefinition[]
  workspaceLoading: boolean
  workspaceError: string | undefined
  nodeCatalog: WorkflowNodeDescriptor[]
  capabilities: {
    creationMode: boolean
    runCode: boolean
    nodeAuthoring: boolean
    sourceAuthoring: boolean
  }
  sourceWorkbenchOpen: boolean
  workflowId: string
  workflowName: string
  workflowOutputDir: string
  version: number
  published: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | undefined
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
  createWorkflow(): void
  openWorkflow(id: string): void
  duplicateWorkflow(id: string): void
  deleteWorkflow(id: string): Promise<void>
  setPublished(published: boolean): Promise<void>
  onNodesChange(changes: NodeChange<FlowNode>[]): void
  onEdgesChange(changes: EdgeChange<FlowEdge>[]): void
  onConnect(connection: Connection): void
  selectNode(id?: string): void
  openNodeDetails(nodeId: string, portId?: string, executionId?: string): void
  closeNodeDetails(): void
  addNode(descriptor: WorkflowNodeDescriptor, position?: { x: number; y: number }): string
  updateNode(id: string, patch: Partial<Pick<FlowNodeData, 'label' | 'config'>>): void
  removeNode(id: string): void
  duplicateNode(id: string): void
  setWorkflowName(name: string): void
  setWorkflowOutputDir(outputDir: string): void
  setRunInput(input: string): void
  save(): Promise<void>
  run(nodeId?: string): Promise<void>
  cancelRun(): Promise<void>
  definition(): WorkflowDefinition
}

export const useFlowStore = create<FlowState>((set, get) => ({
  view: 'workflows',
  workflows: restored.length === 0 ? [first] : restored,
  workspaceLoading: false,
  workspaceError: undefined,
  nodeCatalog: mergeNodeCatalog([]),
  capabilities: { creationMode: false, runCode: false, nodeAuthoring: false, sourceAuthoring: false },
  sourceWorkbenchOpen: false,
  workflowId: first.id,
  workflowName: first.name,
  workflowOutputDir: first.outputDir ?? '',
  version: first.version,
  published: first.published ?? false,
  nodes: initialGraph.nodes,
  edges: initialGraph.edges,
  selectedNodeId: undefined,
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
  async refreshWorkspace() {
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    if (runtime === undefined || agentId === undefined) return
    set({ workspaceLoading: true, workspaceError: undefined })
    try {
      const workspace = await runtime.workspace(agentId)
      const nodeCatalog = setHostNodeCatalog(workspace.nodes)
      set(state => ({
        workflows: workspace.workflows.length === 0 ? state.workflows : workspace.workflows,
        executions: workspace.executions,
        nodeCatalog,
        capabilities: workspace.capabilities,
        workspaceLoading: false,
      }))
      for (const workflow of workspace.workflows) persistLocalWorkflow(workflow)
    } catch (error) {
      set({ workspaceLoading: false, workspaceError: error instanceof Error ? error.message : String(error) })
    }
  },
  createWorkflow() {
    if (get().dirty) void get().save()
    const id = 'workflow-' + Date.now().toString(36)
    const definition: WorkflowDefinition = {
      id, name: 'My workflow', version: 1, published: false,
      nodes: [{ id: 'manual-' + Date.now().toString(36), type: 'trigger.manual', name: 'Manual Trigger', config: {}, position: { x: 180, y: 240 } }],
      edges: [],
    }
    set(state => ({ ...draftFrom(definition), view: 'editor', workflows: replaceWorkflow(state.workflows, definition), dirty: true }))
    void get().save()
  },
  openWorkflow(id) {
    if (get().dirty && get().workflowId !== id) void get().save()
    const definition = get().workflows.find(item => item.id === id)
    if (definition === undefined) return
    set({ ...draftFrom(definition), view: 'editor' })
  },
  duplicateWorkflow(id) {
    if (get().dirty) void get().save()
    const source = get().workflows.find(item => item.id === id)
    if (source === undefined) return
    const now = Date.now().toString(36)
    const copy: WorkflowDefinition = { ...structuredClone(source), id: source.id + '-copy-' + now, name: source.name + ' copy', version: 1, published: false }
    delete copy.createdAt; delete copy.updatedAt; delete copy.publishedAt; delete copy.publishedVersion
    set(state => ({ ...draftFrom(copy), view: 'editor', workflows: replaceWorkflow(state.workflows, copy), dirty: true }))
    void get().save()
  },
  async deleteWorkflow(id) {
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    try {
      if (runtime !== undefined && agentId !== undefined) await runtime.remove(agentId, id)
      removeLocalWorkflow(id)
      set(state => ({ workflows: state.workflows.filter(item => item.id !== id), executions: state.executions.filter(item => item.workflowId !== id), view: 'workflows' }))
    } catch (error) {
      set({ workspaceError: error instanceof Error ? error.message : String(error) })
    }
  },
  async setPublished(published) {
    if (get().dirty) await get().save()
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    if (runtime === undefined || agentId === undefined) { set({ saveError: 'A DSH main session is required.' }); return }
    try {
      const saved = await runtime.publish(agentId, get().workflowId, published)
      set(state => ({ published: saved.published ?? false, workflows: replaceWorkflow(state.workflows, saved), savedAt: saved.updatedAt, saveError: undefined }))
    } catch (error) {
      set({ saveError: error instanceof Error ? error.message : String(error) })
    }
  },
  onNodesChange(changes) {
    const meaningful = changes.some(change => change.type === 'position' || change.type === 'remove' || change.type === 'add')
    set(state => ({ nodes: applyNodeChanges(changes, state.nodes), dirty: state.dirty || meaningful, ...(meaningful ? { saveError: undefined } : {}) }))
    if (meaningful) scheduleAutosave()
  },
  onEdgesChange(changes) {
    set(state => ({ edges: applyEdgeChanges(changes, state.edges), dirty: true, saveError: undefined }))
    scheduleAutosave()
  },
  onConnect(connection) {
    set(state => ({ edges: addEdge({ ...connection, type: 'smoothstep', style: { stroke: 'var(--dsw-alias-border-strong, #7182aa)', strokeWidth: 1.7 } }, state.edges), dirty: true, saveError: undefined }))
    scheduleAutosave()
  },
  selectNode(id) { set({ selectedNodeId: id }) },
  openNodeDetails(nodeId, portId, executionId) { set(state => ({ detailsNodeId: nodeId, detailsPortId: portId, selectedExecutionId: executionId ?? state.executions[0]?.id })) },
  closeNodeDetails() { set({ detailsNodeId: undefined, detailsPortId: undefined }) },
  addNode(descriptor, position = { x: 460, y: 340 }) {
    const id = descriptor.type.replaceAll('.', '-') + '-' + Math.random().toString(36).slice(2, 7)
    set(state => ({ nodes: [...state.nodes, makeNode(id, descriptor.type, position)], selectedNodeId: id, dirty: true, saveError: undefined }))
    scheduleAutosave()
    return id
  },
  updateNode(id, patch) {
    set(state => ({ nodes: state.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node), dirty: true, saveError: undefined }))
    scheduleAutosave()
  },
  removeNode(id) {
    set(state => ({ nodes: state.nodes.filter(node => node.id !== id), edges: state.edges.filter(edge => edge.source !== id && edge.target !== id), selectedNodeId: state.selectedNodeId === id ? undefined : state.selectedNodeId, detailsNodeId: state.detailsNodeId === id ? undefined : state.detailsNodeId, dirty: true }))
    scheduleAutosave()
  },
  duplicateNode(id) {
    const source = get().nodes.find(node => node.id === id)
    if (source === undefined) return
    const copy = structuredClone(source)
    const copyId = id + '-copy-' + Math.random().toString(36).slice(2, 5)
    delete copy.data.executionRecord
    set(state => ({ nodes: [...state.nodes, { ...copy, id: copyId, position: { x: source.position.x + 36, y: source.position.y + 36 }, selected: false, data: { ...copy.data, status: 'WAITING' } }], selectedNodeId: copyId, dirty: true }))
    scheduleAutosave()
  },
  setWorkflowName(workflowName) { set({ workflowName, dirty: true, saveError: undefined }); scheduleAutosave() },
  setWorkflowOutputDir(workflowOutputDir) { set({ workflowOutputDir, dirty: true, saveError: undefined }); scheduleAutosave() },
  setRunInput(runInput) { set({ runInput, runError: undefined }) },
  async save() {
    if (autosaveTimer !== undefined && typeof window !== 'undefined') {
      window.clearTimeout(autosaveTimer)
      autosaveTimer = undefined
    }
    const state = get()
    if (!state.dirty) return
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    try {
      const draft = definitionOf(state)
      persistLocalWorkflow(draft)
      if (runtime === undefined || agentId === undefined) {
        const savedAt = new Date().toISOString()
        set(current => ({ savedAt, dirty: false, saveError: undefined, workflows: replaceWorkflow(current.workflows, { ...draft, updatedAt: savedAt }) }))
        return
      }
      const saved = await runtime.save(agentId, draft)
      persistLocalWorkflow(saved)
      set(current => current.workflowId === saved.id
        ? ({ ...draftFrom(saved), view: current.view, workflows: replaceWorkflow(current.workflows, saved) })
        : ({ workflows: replaceWorkflow(current.workflows, saved) }))
    } catch (error) {
      set({ saveError: error instanceof Error ? error.message : String(error) })
    }
  },
  async run(nodeId) {
    if (get().running) return
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    if (runtime === undefined || agentId === undefined) { set({ runError: 'Open a DSH main session before running this workflow.' }); return }
    let input: JsonValue
    try { input = parseRunInput(get().runInput) } catch (error) { set({ runError: 'Invalid run input JSON: ' + (error instanceof Error ? error.message : String(error)) }); return }
    if (get().dirty) await get().save()
    if (get().dirty) {
      set({ runError: get().saveError ?? 'Save the workflow before executing it.' })
      return
    }
    set(state => ({ running: true, activeExecutionId: undefined, runError: undefined, nodes: state.nodes.map(node => nodeId === undefined || node.id === nodeId ? { ...node, data: { ...node.data, status: 'WAITING' } } : node) }))
    const publishExecution = (execution: WorkflowExecution): void => {
      set(state => {
        const records = new Map(execution.nodes.map(record => [record.nodeId, record]))
        return {
          selectedExecutionId: execution.id,
          activeExecutionId: executionRunning(execution) ? execution.id : undefined,
          running: executionRunning(execution),
          executions: [execution, ...state.executions.filter(item => item.id !== execution.id)],
          nodes: state.nodes.map(node => {
            const record = records.get(node.id)
            return record === undefined ? node : { ...node, data: { ...node.data, status: record.status, executionRecord: record } }
          }),
        }
      })
    }
    try {
      const definition = get().definition()
      const receipt = await runtime.start(agentId, { definition, input, ...(definition.outputDir === undefined ? {} : { outputDir: definition.outputDir }), ...(nodeId === undefined ? {} : { targetNodeId: nodeId }) })
      publishExecution(receipt.execution)
      let execution = receipt.execution
      while (executionRunning(execution)) {
        await delay(300)
        const next = await runtime.execution(agentId, receipt.executionId)
        if (next === null) throw new Error('Host execution not found: ' + receipt.executionId)
        execution = next
        publishExecution(execution)
      }
      void get().refreshWorkspace()
    } catch (error) { set({ running: false, activeExecutionId: undefined, runError: error instanceof Error ? error.message : String(error) }) }
  },
  async cancelRun() {
    const runtime = getFlowRuntime()
    const agentId = runtime?.currentAgentId()
    const executionId = get().activeExecutionId
    if (runtime === undefined || agentId === undefined || executionId === undefined) return
    try { if (!await runtime.cancel(agentId, executionId)) set({ runError: 'This execution has already finished.' }) }
    catch (error) { set({ runError: error instanceof Error ? error.message : String(error) }) }
  },
  definition() { return definitionOf(get()) },
}))

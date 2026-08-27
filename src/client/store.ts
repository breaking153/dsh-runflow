import { create } from 'zustand'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react'
import type {
  JsonObject, NodeExecutionStatus, WorkflowDefinition, WorkflowExecution, WorkflowNodeDescriptor,
} from '../contracts.ts'
import { descriptorFor } from './catalog.tsx'

export interface FlowNodeData extends Record<string, unknown> {
  label: string
  nodeType: string
  description: string
  color: string
  icon: string
  status: NodeExecutionStatus
  config: JsonObject
}

export type FlowNode = Node<FlowNodeData, 'workflow'>
export type FlowEdge = Edge

const initialNodes: FlowNode[] = [
  makeNode('webhook', 'trigger.webhook', { x: 70, y: 220 }, { path: '/hooks/pr-review' }),
  makeNode('script', 'script.javascript', { x: 340, y: 220 }, {
    code: "const total = input.items?.length ?? 0\nreturn { ...input, total }",
    timeoutMs: 5_000,
  }),
  makeNode('agent', 'dsh.agent', { x: 610, y: 220 }, { subagentProvider: 'spawn', prompt: 'Review the incoming pull request', maxDepth: 2 }),
  makeNode('storage', 'storage.write', { x: 880, y: 220 }, { collection: 'review-results' }),
]

const initialEdges: FlowEdge[] = [
  makeEdge('webhook', 'script'),
  makeEdge('script', 'agent'),
  makeEdge('agent', 'storage'),
]

function makeEdge(source: string, target: string): FlowEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    type: 'smoothstep',
    animated: false,
    style: { stroke: '#64748b', strokeWidth: 1.6 },
  }
}

function makeNode(id: string, type: string, position: { x: number; y: number }, config: JsonObject = {}): FlowNode {
  const descriptor = descriptorFor(type)
  return {
    id,
    type: 'workflow',
    position,
    data: {
      label: descriptor.title,
      nodeType: type,
      description: descriptor.description,
      color: descriptor.color,
      icon: descriptor.icon,
      status: 'WAITING',
      config,
    },
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function definitionOf(name: string, version: number, nodes: FlowNode[], edges: FlowEdge[]): WorkflowDefinition {
  return {
    id: 'pr-review-pipeline',
    name,
    version,
    nodes: nodes.map(node => ({
      id: node.id,
      type: node.data.nodeType,
      name: node.data.label,
      config: node.data.config,
      position: node.position,
    })),
    edges: edges.map(edge => ({ id: edge.id, from: edge.source, to: edge.target })),
  }
}

interface FlowState {
  workflowName: string
  version: number
  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string | undefined
  executions: WorkflowExecution[]
  running: boolean
  dirty: boolean
  savedAt?: string
  onNodesChange(changes: NodeChange<FlowNode>[]): void
  onEdgesChange(changes: EdgeChange<FlowEdge>[]): void
  onConnect(connection: Connection): void
  selectNode(id?: string): void
  addNode(descriptor: WorkflowNodeDescriptor, position?: { x: number; y: number }): void
  updateNode(id: string, patch: Partial<Pick<FlowNodeData, 'label' | 'config'>>): void
  removeNode(id: string): void
  duplicateNode(id: string): void
  setWorkflowName(name: string): void
  save(): void
  run(nodeId?: string): Promise<void>
  definition(): WorkflowDefinition
}

export const useFlowStore = create<FlowState>((set, get) => ({
  workflowName: 'PR Review Pipeline',
  version: 3,
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId: 'agent',
  executions: [],
  running: false,
  dirty: false,

  onNodesChange(changes) {
    const meaningful = changes.some(change => change.type === 'position' || change.type === 'remove' || change.type === 'add')
    set(state => ({ nodes: applyNodeChanges(changes, state.nodes), dirty: state.dirty || meaningful }))
  },
  onEdgesChange(changes) {
    set(state => ({ edges: applyEdgeChanges(changes, state.edges), dirty: true }))
  },
  onConnect(connection) {
    set(state => ({
      edges: addEdge({ ...connection, type: 'smoothstep', style: { stroke: '#64748b', strokeWidth: 1.6 } }, state.edges),
      dirty: true,
    }))
  },
  selectNode(id) {
    set(id === undefined ? { selectedNodeId: undefined } : { selectedNodeId: id })
  },
  addNode(descriptor, position = { x: 460, y: 340 }) {
    const suffix = Math.random().toString(36).slice(2, 7)
    const id = `${descriptor.type.replaceAll('.', '-')}-${suffix}`
    set(state => ({
      nodes: [...state.nodes, makeNode(id, descriptor.type, position)],
      selectedNodeId: id,
      dirty: true,
    }))
  },
  updateNode(id, patch) {
    set(state => ({
      nodes: state.nodes.map(node => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node),
      dirty: true,
    }))
  },
  removeNode(id) {
    set(state => ({
      nodes: state.nodes.filter(node => node.id !== id),
      edges: state.edges.filter(edge => edge.source !== id && edge.target !== id),
      selectedNodeId: state.selectedNodeId === id ? undefined : state.selectedNodeId,
      dirty: true,
    }))
  },
  duplicateNode(id) {
    const source = get().nodes.find(node => node.id === id)
    if (source === undefined) return
    const copyId = `${id}-copy-${Math.random().toString(36).slice(2, 5)}`
    set(state => ({
      nodes: [...state.nodes, {
        ...structuredClone(source),
        id: copyId,
        position: { x: source.position.x + 36, y: source.position.y + 36 },
        selected: false,
      }],
      selectedNodeId: copyId,
      dirty: true,
    }))
  },
  setWorkflowName(workflowName) { set({ workflowName, dirty: true }) },
  save() {
    const state = get()
    const version = state.version + 1
    const savedAt = new Date().toISOString()
    localStorage.setItem('dsh-flow:pr-review-pipeline', JSON.stringify(definitionOf(state.workflowName, version, state.nodes, state.edges)))
    set({ version, savedAt, dirty: false })
  },
  async run(nodeId) {
    if (get().running) return
    const executionId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    const targets = nodeId === undefined ? get().nodes : get().nodes.filter(node => node.id === nodeId)
    const initial: WorkflowExecution = {
      id: executionId,
      workflowId: 'pr-review-pipeline',
      version: get().version,
      status: 'RUNNING',
      trigger: nodeId === undefined ? 'manual' : 'debug',
      startedAt,
      nodes: targets.map(node => ({ nodeId: node.id, status: 'WAITING', attempts: 0 })),
    }
    set(state => ({
      running: true,
      nodes: state.nodes.map(node => ({ ...node, data: { ...node.data, status: targets.some(target => target.id === node.id) ? 'WAITING' : node.data.status } })),
      executions: [initial, ...state.executions],
    }))

    for (const node of targets) {
      set(state => ({
        nodes: state.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, status: 'RUNNING' } } : item),
        executions: state.executions.map(item => item.id === executionId ? {
          ...item,
          nodes: item.nodes.map(record => record.nodeId === node.id ? { ...record, status: 'RUNNING', attempts: 1, startedAt: new Date().toISOString() } : record),
        } : item),
      }))
      await delay(360 + Math.random() * 280)
      set(state => ({
        nodes: state.nodes.map(item => item.id === node.id ? { ...item, data: { ...item.data, status: 'SUCCESS' } } : item),
        executions: state.executions.map(item => item.id === executionId ? {
          ...item,
          nodes: item.nodes.map(record => record.nodeId === node.id ? { ...record, status: 'SUCCESS', finishedAt: new Date().toISOString(), durationMs: 420, output: { ok: true, nodeId: node.id } } : record),
        } : item),
      }))
    }
    set(state => ({
      running: false,
      executions: state.executions.map(item => item.id === executionId ? {
        ...item,
        status: 'SUCCESS',
        finishedAt: new Date().toISOString(),
        output: { ok: true },
      } : item),
    }))
  },
  definition() {
    const state = get()
    return definitionOf(state.workflowName, state.version, state.nodes, state.edges)
  },
}))

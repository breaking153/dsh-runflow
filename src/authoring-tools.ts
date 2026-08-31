import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createScope, type ScopeKey } from '@deepseek-ai/dsh-scope'
import { defineTool, RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import type { JsonObject, JsonValue, WorkflowDefinition, WorkflowNode } from './contracts.ts'
import type { FlowService } from './flow-service.ts'
import type { NodeDraftInput } from './node-library.ts'

interface AgentPresetScopes {
  standingKeyFor(id?: string): Promise<ScopeKey>
}

interface RuntimeSkills {
  register(skill: {
    name: string
    description: string
    source: string
    content: string
    invocation?: { modelInvocable: boolean; userInvocable: boolean }
  }): () => void
}

const jsonOutput = {
  schema: { type: 'json' as const },
  render: (_args: unknown, value: JsonValue) => [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
}

function requireString(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) throw new Error(name + ' is required')
  return value.trim()
}

function requireObject(value: JsonValue | undefined, name: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(name + ' must be a JSON object')
  }
  return value
}

function asDefinition(value: JsonValue | undefined): WorkflowDefinition {
  return requireObject(value, 'definition') as unknown as WorkflowDefinition
}

function asNode(value: JsonValue | undefined): WorkflowNode {
  return requireObject(value, 'node') as unknown as WorkflowNode
}

function asDraft(descriptor: JsonValue | undefined, program: string | undefined): NodeDraftInput {
  return {
    descriptor: requireObject(descriptor, 'descriptor') as unknown as NodeDraftInput['descriptor'],
    program: requireString(program, 'program'),
  }
}

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue
}

function nodeTool(flow: FlowService) {
  return defineTool({
    name: 'runflow_node',
    description:
      'Develop and manage RunFlow node providers. Use list/get for inspection; create/update inject a revisioned '
      + 'file-backed draft node whose program runs through DSH run_code; test executes that draft inside the real RunFlow '
      + 'engine; commit is allowed only after the current revision passes; delete_draft and delete_persisted remove '
      + 'only mutable RunFlow nodes. Programs receive input, named inputs, config, and the frozen runflow context. '
      + 'Return a normal JSON value for one output or {$runflow:"port-outputs",outputs:{...}} for named outputs.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'get', 'create', 'update', 'delete_draft', 'test', 'commit', 'delete_persisted'],
      },
      type: { type: 'string', description: 'Namespaced node type.' },
      descriptor: { type: 'json', description: 'WorkflowNodeDescriptor for create/update.' },
      program: { type: 'string', description: 'TypeScript/JavaScript run_code function body.' },
      input: { type: 'json', description: 'Test input.' },
      config: { type: 'json', description: 'Test node config object.' },
      outputDir: { type: 'string', description: 'Optional test output base directory.' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      switch (args.action) {
        case 'list':
          return json({ nodes: flow.listNodeLibrary() })
        case 'get': {
          const type = requireString(args.type, 'type')
          const entry = flow.node(type)
          if (entry === undefined) throw new Error('node is unknown: ' + type)
          return json(entry)
        }
        case 'create':
        case 'update':
          return json(flow.upsertNodeDraft(asDraft(args.descriptor, args.program)))
        case 'delete_draft':
          return json({ removed: flow.removeNodeDraft(requireString(args.type, 'type')) })
        case 'test': {
          if (exec.agent === undefined) throw new Error('node tests require an Agent-backed creation session')
          const config = args.config === undefined ? undefined : requireObject(args.config, 'config')
          return json(await flow.testNodeDraft(requireString(args.type, 'type'), {
            agentId: String(exec.agent.id),
            ...(args.input === undefined ? {} : { input: args.input }),
            ...(config === undefined ? {} : { config }),
            ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
            signal: exec.signal,
          }))
        }
        case 'commit':
          return json(await flow.commitNodeDraft(requireString(args.type, 'type')))
        case 'delete_persisted':
          return json({ removed: await flow.removePersistedNode(requireString(args.type, 'type')) })
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'RunFlow node · ' + args.action,
        kind: ['list', 'get'].includes(args.action) ? 'read' : args.action.includes('delete') ? 'delete' : 'execute',
        rawInput: args.type ?? args.action,
      }
    },
  })
}

function workflowTool(flow: FlowService) {
  return defineTool({
    name: 'runflow_workflow',
    description:
      'Create, inspect, edit, execute, and diagnose RunFlow workflows. Node instance CRUD is exposed as add_node, '
      + 'update_node, and delete_node; updates can replace node type, name, config, position, or disabled state. '
      + 'Run results include typed port values, logs, errors, outputDir, and artifact file paths.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: [
          'list', 'get', 'save', 'delete', 'add_node', 'update_node', 'delete_node',
          'run', 'get_execution', 'list_executions', 'cancel',
        ],
      },
      workflowId: { type: 'string' },
      definition: { type: 'json' },
      node: { type: 'json' },
      nodeId: { type: 'string' },
      patch: { type: 'json' },
      input: { type: 'json' },
      outputDir: { type: 'string' },
      executionId: { type: 'string' },
      limit: { type: 'integer' },
    },
    output: jsonOutput,
    async execute(args, exec) {
      switch (args.action) {
        case 'list':
          return json({ workflows: flow.listWorkflows() })
        case 'get': {
          const id = requireString(args.workflowId, 'workflowId')
          const workflow = flow.workflow(id)
          if (workflow === undefined) throw new Error('Workflow not found: ' + id)
          return json(workflow)
        }
        case 'save':
          return json(flow.saveWorkflow(asDefinition(args.definition)))
        case 'delete':
          return json({ removed: flow.deleteWorkflow(requireString(args.workflowId, 'workflowId')) })
        case 'add_node':
          return json(flow.upsertWorkflowNode(
            requireString(args.workflowId, 'workflowId'),
            asNode(args.node),
          ))
        case 'update_node':
          return json(flow.updateWorkflowNode(
            requireString(args.workflowId, 'workflowId'),
            requireString(args.nodeId, 'nodeId'),
            requireObject(args.patch, 'patch') as unknown as Partial<Omit<WorkflowNode, 'id'>>,
          ))
        case 'delete_node':
          return json(flow.removeWorkflowNode(
            requireString(args.workflowId, 'workflowId'),
            requireString(args.nodeId, 'nodeId'),
          ))
        case 'run':
          if (exec.agent === undefined) throw new Error('workflow execution requires an Agent-backed session')
          return json(await flow.execute(requireString(args.workflowId, 'workflowId'), {
            agentId: String(exec.agent.id),
            ...(args.input === undefined ? {} : { input: args.input }),
            ...(args.outputDir === undefined ? {} : { outputDir: args.outputDir }),
            signal: exec.signal,
          }))
        case 'get_execution': {
          const id = requireString(args.executionId, 'executionId')
          const execution = flow.execution(id)
          if (execution === undefined) throw new Error('execution not found: ' + id)
          return json(execution)
        }
        case 'list_executions':
          return json({
            executions: flow.listExecutions(
              args.workflowId,
              args.limit === undefined ? 50 : Math.max(0, args.limit),
            ),
          })
        case 'cancel':
          return json({ cancelled: flow.cancel(requireString(args.executionId, 'executionId')) })
      }
    },
    presentCall(args) {
      return {
        card: 'generic',
        title: 'RunFlow workflow · ' + args.action,
        kind: ['list', 'get', 'get_execution', 'list_executions'].includes(args.action)
          ? 'read'
          : ['delete', 'delete_node'].includes(args.action) ? 'delete' : 'execute',
        rawInput: args.workflowId ?? args.executionId ?? args.action,
      }
    },
  })
}

const AUTHORING_SKILL = [
  '# DSH RunFlow node development',
  '',
  'Use RunFlow only for workflow and node-authoring tasks in this DSH creation preset.',
  '',
  'Node lifecycle:',
  '1. Call runflow_node with action list/get before changing a provider.',
  '2. Call create or update to write descriptor + program into nodes/.drafts and hot-load it into the node library.',
  '3. Call test. This runs a one-node workflow in the real RunFlow engine and executes program through DSH run_code.',
  '4. Inspect execution node logs, outputPorts, error, outputDir, and artifacts. Revise and test again when needed.',
  '5. Call commit only after the current revision passes. Commit moves it to a durable .node.json provider in nodes/.',
  '',
  'Program bindings: input is the compatibility input; inputs contains named input ports; config is node configuration; '
    + 'runflow contains executionId, nodeId, outputDir, and intermediateDir.',
  'Return ordinary lossless JSON for a single output. For multiple outputs return '
    + '{$runflow:"port-outputs",outputs:{portName:value}} and declare matching typed descriptor.outputs.',
  'For direct trusted Host ctx access, author a typed *.node.ts or *.script.ts Cordis child plugin from the bundled templates; '
    + 'these files are hot-loaded and are not run_code sandboxes.',
  'Do not hand-edit JSON node documents when the draft/test/commit lifecycle can do it.',
].join('\n')

/** Ensure the live creation Agent itself carries the executable authoring surface. */
export function ensureRunFlowAgentAuthoring(
  ctx: Context,
  flow: FlowService,
  agent: Agent,
  presetId = 'cordis',
): boolean {
  if ((agent.session.header as { agentPreset?: string }).agentPreset !== presetId) return false
  if (ctx.tools.get(RUN_CODE_NAME, agent) === undefined) agent.ctx.tools.presentAs('both')
  if (ctx.tools.get('runflow_node', agent) === undefined) agent.ctx.tools.register(nodeTool(flow))
  if (ctx.tools.get('runflow_workflow', agent) === undefined) agent.ctx.tools.register(workflowTool(flow))
  return ctx.tools.get(RUN_CODE_NAME, agent) !== undefined
    && ctx.tools.get('runflow_node', agent) !== undefined
    && ctx.tools.get('runflow_workflow', agent) !== undefined
}

export function installRunFlowAuthoring(
  ctx: Context,
  flow: FlowService,
  presetId: string,
): void {
  ctx.effect(async function* () {
    const presets = ctx.get('agentPresets') as AgentPresetScopes | undefined
    const skills = ctx.get('skills') as RuntimeSkills | undefined
    if (presets === undefined || skills === undefined) return
    const key = await presets.standingKeyFor(presetId)
    const scope = createScope(ctx, key)
    const installInto = (target: Context): void => {
      if (target.tools.get(RUN_CODE_NAME) === undefined) target.tools.presentAs('both')
      if (target.tools.get('runflow_node') === undefined) target.tools.register(nodeTool(flow))
      if (target.tools.get('runflow_workflow') === undefined) target.tools.register(workflowTool(flow))
      ;(target.get('skills') as RuntimeSkills).register({
        name: 'dsh-runflow-node-development',
        description: 'Create, test, debug, and solidify typed RunFlow nodes through DSH run_code.',
        source: 'runtime',
        content: AUTHORING_SKILL,
        invocation: { modelInvocable: true, userInvocable: true },
      })
    }
    const isCreationAgent = (agent: Agent): boolean =>
      (agent.session.header as { agentPreset?: string }).agentPreset === presetId
    try {
      installInto(scope.ctx)
    } catch (error) {
      await scope.dispose()
      throw error
    }
    // A standing preset scope is the normal inheritance route. The fallback
    // below also covers agents that were already live when this plugin was
    // installed or whose parent link was established before this contribution.
    const attach = (agent: Agent): void => {
      if (!isCreationAgent(agent) || ctx.tools.get('runflow_node', agent) !== undefined) return
      ensureRunFlowAgentAuthoring(ctx, flow, agent, presetId)
    }
    const agents = ctx.get('agents') as { list(): Agent[] } | undefined
    for (const agent of agents?.list() ?? []) attach(agent)
    const stopAgents = ctx.on('agent/created', ({ agent }) => attach(agent))
    yield async () => {
      stopAgents()
      await scope.dispose()
    }
  }, 'dsh-runflow: creation-mode authoring layer')
}

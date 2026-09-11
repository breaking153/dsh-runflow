import { randomUUID } from 'node:crypto'
import type {
  ExecuteWorkflowOptions, ExecutionArtifact, JsonObject, JsonValue, NodeControlEnvelope,
  NodeExecutionRecord, NodeOutputEnvelope, WorkflowActivation, WorkflowDefinition,
  WorkflowExecution, WorkflowGraphCheckpoint, WorkflowNode, WorkflowNodeDefinition,
  WorkflowPortDescriptor, WorkflowValidationIssue, WorkflowCallScope,
} from './contracts.ts'
import { safeOutputSegment, type ExecutionOutputWriter } from './output-store.ts'
import { WorkflowExecutionError, WorkflowValidationError, validateWorkflow, type WorkflowEngineOptions } from './engine.ts'
import { effectiveNodeDescriptor, resolveNodeConfig } from './node-properties.ts'
import { completeNodeOutput, type NormalizedNodeOutput } from './node-execution.ts'
import { blueprintEntryNodes, blueprintExecutionKind, blueprintFlowEdge, blueprintInputMessages, mergeBlueprintCalls, validBlueprintCheckpoint } from './blueprint-runtime.ts'

const clone = <T>(value: T): T => structuredClone(value)
const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const own = (value: object, key: PropertyKey): boolean => Object.hasOwn(value, key)
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype'])
const inputsFor = (provider: WorkflowNodeDefinition): WorkflowPortDescriptor[] => provider.inputs ?? [{ id: 'input', type: 'any' }]
const outputsFor = (provider: WorkflowNodeDefinition): WorkflowPortDescriptor[] => provider.outputs ?? [{ id: 'output', type: 'any' }]

export function validateStateGraph(definition: WorkflowDefinition, resolve?: WorkflowEngineOptions['resolveNode']): WorkflowValidationIssue[] {
  const issues: WorkflowValidationIssue[] = []
  const invalid = (text: string): void => { issues.push({ code: 'INVALID_EXECUTION', message: text }) }
  const config = definition.execution!
  if (config.maxSteps !== undefined && (!Number.isInteger(config.maxSteps) || config.maxSteps < 1 || config.maxSteps > 1000)) invalid('State graph maxSteps must be an integer between 1 and 1000')
  if (config.initialState !== undefined && !object(config.initialState)) invalid('State graph initialState must be a JSON object')
  if (config.reducers !== undefined && (!object(config.reducers) || Object.entries(config.reducers).some(([key, reducer]) => unsafeKeys.has(key) || !['replace', 'append', 'sum', 'merge'].includes(String(reducer))))) invalid('State graph reducers contain an invalid key or reducer')
  if (object(config.initialState) && Object.keys(config.initialState).some(key => unsafeKeys.has(key))) invalid('State graph initialState contains a reserved key')
  const ids = new Set(definition.nodes.map(node => node.id))
  if (definition.nodes.some(node => unsafeKeys.has(node.id))) invalid('State graph node ids must not use reserved object keys')
  const blueprint = config.semantics === 'blueprint' && resolve !== undefined
  const entries = config.entryNodeIds ?? (blueprint ? blueprintEntryNodes(definition, resolve) : definition.nodes.filter(node => !definition.edges.some(edge => edge.to === node.id)).map(node => node.id))
  if (!Array.isArray(entries) || entries.length === 0 || entries.some(id => typeof id !== 'string' || !ids.has(id))) invalid('State graph requires valid entryNodeIds or a node without incoming edges')
  if (issues.length > 0) return issues
  const reached = new Set(entries)
  const queue = [...entries]
  for (let index = 0; index < queue.length; index += 1) {
    for (const edge of definition.edges.filter(edge => edge.from === queue[index])) {
      if (!reached.has(edge.to)) { reached.add(edge.to); queue.push(edge.to) }
    }
  }
  for (const node of definition.nodes) {
    const provider = resolve?.(node.type)
    if (!reached.has(node.id) && !(blueprint && provider !== undefined && blueprintExecutionKind(provider) === 'pure')) invalid('State graph node is unreachable from an entry: ' + node.id)
  }
  return issues
}

function reduceState(previous: JsonObject, updates: JsonObject[], definition: WorkflowDefinition): JsonObject {
  const next = clone(previous)
  const writes = new Map<string, JsonValue[]>()
  for (const update of updates) {
    if (!object(update)) throw new WorkflowExecutionError('State update must be an object', 'FLOW_STATE_UPDATE')
    for (const [key, value] of Object.entries(update)) {
      if (unsafeKeys.has(key)) throw new WorkflowExecutionError('State update uses a reserved key', 'FLOW_STATE_UPDATE')
      const values = writes.get(key) ?? []
      values.push(value)
      writes.set(key, values)
    }
  }
  for (const [key, values] of writes) {
    const reducers = definition.execution?.reducers ?? {}
    const reducer = own(reducers, key) ? reducers[key]! : 'replace'
    if (reducer === 'replace') {
      if (values.length > 1) throw new WorkflowExecutionError('State key ' + key + ' has concurrent writes; configure a reducer', 'FLOW_STATE_CONFLICT')
      next[key] = clone(values[0]!)
    } else if (reducer === 'append') {
      const initial = own(previous, key) ? previous[key] : []
      if (!Array.isArray(initial) || values.some(value => !Array.isArray(value))) throw new WorkflowExecutionError('Append reducer requires arrays for ' + key, 'FLOW_STATE_UPDATE')
      next[key] = [...clone(initial), ...values.flatMap(value => clone(value as JsonValue[]))]
    } else if (reducer === 'sum') {
      const initial = own(previous, key) ? previous[key] : 0
      if (typeof initial !== 'number' || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new WorkflowExecutionError('Sum reducer requires finite numbers for ' + key, 'FLOW_STATE_UPDATE')
      const total = initial + (values as number[]).reduce((sum, value) => sum + value, 0)
      if (!Number.isFinite(total)) throw new WorkflowExecutionError('Sum reducer overflow for ' + key, 'FLOW_STATE_UPDATE')
      next[key] = total
    } else {
      const initial = own(previous, key) ? previous[key] : {}
      if (!object(initial) || values.some(value => !object(value))) throw new WorkflowExecutionError('Merge reducer requires objects for ' + key, 'FLOW_STATE_UPDATE')
      next[key] = values.reduce<JsonObject>((merged, value) => ({ ...merged, ...clone(value as JsonObject) }), clone(initial))
    }
  }
  return next
}

function nodeInput(provider: WorkflowNodeDefinition, messages: WorkflowActivation[], triggerInput: JsonValue, blueprint = false): { input: JsonValue; ports: JsonObject } {
  const descriptors = inputsFor(provider)
  const ports: JsonObject = {}
  for (const activation of messages) {
    const id = activation.targetPort ?? (activation.edgeIndex === undefined && activation.from === undefined
      ? descriptors.find(port => port.configKey === undefined)?.id : descriptors[0]?.id)
    if (id === undefined) continue
    const descriptor = descriptors.find(port => port.id === id)
    const multiple = descriptor?.multiple === true && (!blueprint || descriptor.type !== 'flow' || provider.activation === 'all')
    if (own(ports, id) && !multiple && descriptor?.type !== 'flow') throw new WorkflowExecutionError('Input port ' + id + ' received multiple messages; use a multiple input or Join node', 'FLOW_INPUT_CARDINALITY')
    if (multiple) {
      const current = ports[id]
      ports[id] = [...(Array.isArray(current) ? current : []), clone(activation.value)]
    } else ports[id] = clone(activation.value)
  }
  const ordinaryPorts = Object.fromEntries(Object.entries(ports).filter(([id]) => descriptors.find(port => port.id === id)?.configKey === undefined))
  const dataPorts = Object.fromEntries(Object.entries(ordinaryPorts).filter(([id]) => descriptors.find(port => port.id === id)?.type !== 'flow'))
  const primaryPorts = blueprint && Object.keys(dataPorts).length > 0 ? dataPorts : ordinaryPorts
  const values = Object.values(primaryPorts)
  const initialInput = messages.find(item => item.edgeIndex === undefined)?.value ?? triggerInput
  return { ports, input: values.length === 0 ? clone(initialInput) : values.length === 1 ? values[0]! : primaryPorts }
}

type Normalized = NormalizedNodeOutput
function normalize(value: JsonValue | NodeOutputEnvelope | NodeControlEnvelope, provider: WorkflowNodeDefinition, input: JsonValue): Normalized {
  if (object(value) && (value.$runflow === 'port-outputs' || value.$runflow === 'control')) {
    const control = value.$runflow === 'control' ? value as unknown as NodeControlEnvelope : undefined
    const firstPort = outputsFor(provider)[0]?.id
    const ports = value.outputs === undefined && control !== undefined ? firstPort === undefined ? {} : { [firstPort]: clone(input) } : value.outputs
    if (!object(ports)) throw new WorkflowExecutionError('Node output envelope requires an outputs object', 'FLOW_NODE_OUTPUT')
    const descriptors = outputsFor(provider)
    if (Object.keys(ports).some(id => !descriptors.some(port => port.id === id))) throw new WorkflowExecutionError('Node emitted an undeclared output port: ' + provider.type, 'FLOW_NODE_OUTPUT')
    if (control?.routes !== undefined && (!Array.isArray(control.routes) || control.routes.some(id => !descriptors.some(port => port.id === id)))) throw new WorkflowExecutionError('Node routed to an undeclared output port: ' + provider.type, 'FLOW_NODE_ROUTE')
    const values = Object.values(ports)
    return completeNodeOutput({ output: own(ports, 'output') ? ports.output! : values.length === 1 ? values[0]! : clone(ports), ports: clone(ports), ...(control === undefined ? {} : { control }) }, provider)
  }
  const id = outputsFor(provider)[0]?.id
  return completeNodeOutput({ output: clone(value as JsonValue), ports: id === undefined ? {} : { [id]: clone(value as JsonValue) } }, provider)
}

function memoryArtifact(executionId: string, nodeId: string, label: string, value: JsonValue, portId?: string): ExecutionArtifact {
  const rendered = JSON.stringify(value)
  return { kind: 'intermediate', nodeId, label, path: 'memory://' + executionId + '/' + nodeId + '/' + encodeURIComponent(label), mediaType: 'application/json', bytes: new TextEncoder().encode(rendered).length,
    preview: rendered.slice(0, 240), ...(portId === undefined ? {} : { portId }) }
}

/** Abort-aware node boundary. Providers still must cooperate to stop their own effects. */
async function runWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, signal: AbortSignal, onNodeTask?: WorkflowEngineOptions['onNodeTask']): Promise<T> {
  const controller = new AbortController()
  const relay = (): void => controller.abort(signal.reason)
  signal.addEventListener('abort', relay, { once: true })
  if (signal.aborted) relay()
  const timer = setTimeout(() => controller.abort(new WorkflowExecutionError('Node timed out after ' + timeoutMs + 'ms', 'FLOW_NODE_TIMEOUT')), timeoutMs)
  let onAbort: (() => void) | undefined
  try {
    if (controller.signal.aborted) throw new WorkflowExecutionError('Workflow execution cancelled', 'FLOW_CANCELLED')
    const task = Promise.resolve().then(() => operation(controller.signal))
    void task.catch(() => undefined)
    onNodeTask?.(task)
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new WorkflowExecutionError(String(controller.signal.reason ?? 'Workflow execution cancelled'), 'FLOW_CANCELLED'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort()
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', relay)
    if (onAbort !== undefined) controller.signal.removeEventListener('abort', onAbort)
  }
}

function checkpointMatches(checkpoint: WorkflowGraphCheckpoint, definition: WorkflowDefinition, options: ExecuteWorkflowOptions, resolve: WorkflowEngineOptions['resolveNode']): boolean {
  const ids = new Set(definition.nodes.map(node => node.id))
  return checkpoint.schemaVersion === 1 && checkpoint.workflowId === definition.id && checkpoint.workflowVersion === definition.version
    && (options.executionId === undefined || options.executionId === checkpoint.executionId)
    && Number.isInteger(checkpoint.step) && checkpoint.step >= 0 && object(checkpoint.state)
    && Array.isArray(checkpoint.pending) && checkpoint.pending.every(activation => ids.has(activation.nodeId))
    && object(checkpoint.joins) && object(checkpoint.iterations) && object(checkpoint.interrupts)
    && Array.isArray(checkpoint.nodes) && Array.isArray(checkpoint.steps) && object(checkpoint.lastOutputs) && object(checkpoint.lastPortOutputs)
    && (checkpoint.lastTerminalOutputs === undefined || object(checkpoint.lastTerminalOutputs) && Object.keys(checkpoint.lastTerminalOutputs).every(id => ids.has(id)))
    && (definition.execution?.semantics === 'blueprint' ? validBlueprintCheckpoint(checkpoint, definition, resolve) : checkpoint.semantics === undefined)
}

export async function executeStateGraph(definition: WorkflowDefinition, options: ExecuteWorkflowOptions, engine: WorkflowEngineOptions): Promise<WorkflowExecution> {
  const blueprint = definition.execution?.semantics === 'blueprint'
  const snapshot = new Map<string, WorkflowNodeDefinition | undefined>()
  for (const node of definition.nodes) if (!snapshot.has(node.type)) snapshot.set(node.type, engine.resolveNode(node.type))
  const resolve = (type: string): WorkflowNodeDefinition | undefined => snapshot.get(type)
  const issues = validateWorkflow(definition, resolve)
  if (issues.length > 0) throw new WorkflowValidationError(issues)
  const checkpoint = options.checkpoint
  if (checkpoint !== undefined && !checkpointMatches(checkpoint, definition, options, resolve)) throw new WorkflowExecutionError('Workflow checkpoint does not match this execution or workflow revision', 'FLOW_CHECKPOINT_INVALID')
  const entryNodeIds = options.entryNodeIds ?? definition.execution?.entryNodeIds ?? (blueprint ? blueprintEntryNodes(definition, resolve) : definition.nodes.filter(node => !definition.edges.some(edge => edge.to === node.id)).map(node => node.id))
  if (entryNodeIds.length === 0 || entryNodeIds.some(id => !definition.nodes.some(node => node.id === id))) throw new WorkflowExecutionError('Invalid state graph entry node', 'FLOW_ENTRY_INVALID')
  const triggerInput = options.input ?? {}
  let pending: WorkflowActivation[] = clone(checkpoint?.pending ?? entryNodeIds.map(nodeId => ({ nodeId, value: triggerInput,
    ...(blueprint ? { call: { id: randomUUID(), outputs: {} } } : {}) })))
  const joins: Record<string, WorkflowActivation[]> = clone(checkpoint?.joins ?? {})
  const iterations = clone(checkpoint?.iterations ?? {})
  const lastOutputs = clone(checkpoint?.lastOutputs ?? {})
  const lastPortOutputs = clone(checkpoint?.lastPortOutputs ?? {})
  const lastTerminalOutputs = clone(checkpoint?.lastTerminalOutputs ?? Object.fromEntries(Object.entries(lastOutputs).map(([id, value]) => [id, Object.keys(lastPortOutputs[id] ?? {}).length > 1 ? lastPortOutputs[id]! : value])))
  const interrupts = clone(checkpoint?.interrupts ?? {})
  let state = clone(checkpoint?.state ?? definition.execution?.initialState ?? {})
  let step = checkpoint?.step ?? 0
  const records = new Map<string, NodeExecutionRecord>((checkpoint?.nodes ?? definition.nodes.map(node => ({ nodeId: node.id, status: 'WAITING' as const, attempts: 0, logs: [], artifacts: [] }))).map(record => [record.nodeId, clone(record)]))
  const execution: WorkflowExecution = { id: checkpoint?.executionId ?? options.executionId ?? randomUUID(), workflowId: definition.id, version: definition.version,
    status: 'RUNNING', trigger: options.trigger ?? 'manual', input: clone(triggerInput), startedAt: checkpoint?.startedAt ?? new Date().toISOString(), nodes: [...records.values()], state, step, steps: clone(checkpoint?.steps ?? []) }
  const publish = (): void => { execution.nodes = [...records.values()].map(clone); execution.state = clone(state); execution.step = step; engine.onUpdate?.(clone(execution)) }
  const makeCheckpoint = (): WorkflowGraphCheckpoint => ({ schemaVersion: 1, ...(blueprint ? { semantics: 'blueprint' as const } : {}), workflowId: definition.id, workflowVersion: definition.version, executionId: execution.id, ...(execution.startedAt === undefined ? {} : { startedAt: execution.startedAt }), step, state: clone(state), pending: clone(pending), joins: clone(joins), iterations: clone(iterations), nodes: [...records.values()].map(clone), steps: clone(execution.steps ?? []), lastOutputs: clone(lastOutputs), lastPortOutputs: clone(lastPortOutputs), lastTerminalOutputs: clone(lastTerminalOutputs), interrupts: clone(interrupts) })
  const controller = new AbortController()
  const relayAbort = (): void => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', relayAbort, { once: true })
  if (options.signal?.aborted) relayAbort()
  let writer: ExecutionOutputWriter | undefined
  let accepting = true
  const maxSteps = definition.execution?.maxSteps ?? 100
  const parallel = Math.max(1, Math.min(64, Math.floor(engine.maxParallelNodes) || 1))
  let halted = false
  const applyLateCancellation = (): boolean => {
    if (!controller.signal.aborted || execution.status === 'CANCELLED') return false
    execution.status = 'CANCELLED'
    execution.error = String(controller.signal.reason ?? 'Workflow execution cancelled')
    execution.finishedAt = new Date().toISOString()
    for (const record of records.values()) {
      if (record.status === 'WAITING' || record.status === 'RUNNING' || record.status === 'PAUSED') {
        record.status = 'CANCELLED'
        record.finishedAt = execution.finishedAt
      }
    }
    return true
  }
  try {
    publish()
    writer = await engine.createOutput?.(clone(execution))
    if (writer !== undefined) { execution.outputDir = writer.outputDir; await writer.initialize() }
    while (true) {
      if (controller.signal.aborted) throw new WorkflowExecutionError(String(controller.signal.reason ?? 'Workflow execution cancelled'), 'FLOW_CANCELLED')
      if (Object.keys(interrupts).some(id => !own(options.resumeValues ?? {}, id))) { execution.status = 'PAUSED'; execution.checkpoint = makeCheckpoint(); break }
      const grouped = new Map<string, WorkflowActivation[]>()
      for (const activation of pending) { const values = grouped.get(activation.nodeId) ?? []; values.push(activation); grouped.set(activation.nodeId, values) }
      pending = []
      const ready: { node: WorkflowNode; messages: WorkflowActivation[] }[] = []
      for (const node of definition.nodes) {
        const incoming = grouped.get(node.id) ?? []
        const provider = resolve(node.type)
        const channels = definition.edges.flatMap((edge, index) => edge.to === node.id && (!blueprint || blueprintFlowEdge(edge, definition, resolve)) ? [index] : [])
        if (provider?.activation === 'all' && channels.length > 0) {
          const stored = own(joins, node.id) ? joins[node.id]! : []
          const buffered = blueprint && own(interrupts, node.id) ? [...incoming, ...stored] : [...stored, ...incoming]
          const candidates = blueprint ? [...new Set(buffered.map(item => item.call?.id))] : [undefined]
          const readyCall = candidates.findIndex(callId => channels.every(index => buffered.some(item => item.edgeIndex === index && (!blueprint || item.call?.id === callId))))
          if (readyCall >= 0) {
            const callId = candidates[readyCall]
            const selected = channels.map(index => buffered.splice(buffered.findIndex(item => item.edgeIndex === index && (!blueprint || item.call?.id === callId)), 1)[0]!)
            ready.push({ node, messages: selected })
          }
          if (buffered.length > 0) joins[node.id] = buffered
          else delete joins[node.id]
        } else if (incoming.length > 0) {
          ready.push({ node, messages: blueprint ? [incoming[0]!] : incoming })
          if (blueprint) pending.push(...incoming.slice(1))
        }
      }
      if (ready.length === 0) {
        if (Object.values(joins).some(values => values.length > 0)) throw new WorkflowExecutionError('State graph join is waiting for an inactive incoming branch', 'FLOW_JOIN_STALLED')
        break
      }
      if (step >= maxSteps) throw new WorkflowExecutionError('State graph exceeded its step limit (' + maxSteps + ')', 'FLOW_STEP_LIMIT')
      const results: { node: WorkflowNode; messages: WorkflowActivation[]; record: NodeExecutionRecord; call?: WorkflowCallScope; result?: Normalized }[] = []
      const snapshotState = clone(state)
      const nextIterations = clone(iterations)
      type Demand = { call: WorkflowCallScope; consumer: string; active: Set<string>; cache: Map<string, Normalized> }
      const run = async (item: typeof ready[number], demandContext?: Demand): Promise<Normalized | undefined> => {
        const { node, messages } = item
        const iteration = (own(nextIterations, node.id) ? nextIterations[node.id]! : 0) + 1
        nextIterations[node.id] = iteration
        const record: NodeExecutionRecord = { nodeId: node.id, ...(demandContext === undefined ? {} : { evaluatedFor: demandContext.consumer }), step: step + 1, iteration, status: node.disabled ? 'SKIPPED' : 'RUNNING', attempts: 0, logs: [], artifacts: [], startedAt: new Date().toISOString() }
        records.set(node.id, record)
        const output = { node, messages, record } as typeof results[number]
        results.push(output)
        if (node.disabled) { record.finishedAt = new Date().toISOString(); return }
        const provider = resolve(node.type)
        if (provider === undefined || provider.available === false) throw new WorkflowExecutionError('Node provider is unavailable: ' + node.type, 'FLOW_NODE_UNAVAILABLE')
        let resolved: { input: JsonValue; ports: JsonObject }
        try {
          if (blueprint) { output.call = demandContext?.call ?? mergeBlueprintCalls(messages); record.callId = output.call.id }
          const demand = output.call === undefined ? undefined : demandContext ?? { call: output.call, consumer: node.id, active: new Set([node.id]), cache: new Map<string, Normalized>() }
          const inputMessages = output.call === undefined ? messages : await blueprintInputMessages(node, messages, output.call, definition, resolve, async source => {
            if (demand!.active.has(source.id)) throw new WorkflowExecutionError('Blueprint pure dependency cycle at ' + source.id, 'FLOW_PURE_CYCLE')
            const cached = demand!.cache.get(source.id)
            if (cached !== undefined) return clone(cached.ports)
            demand!.active.add(source.id)
            try {
              const evaluated = await run({ node: source, messages: [] }, demand!)
              if (evaluated === undefined) throw new WorkflowExecutionError('Pure input provider is disabled: ' + source.id, 'FLOW_DATA_UNAVAILABLE')
              demand!.cache.set(source.id, evaluated)
              return clone(evaluated.ports)
            } finally { demand!.active.delete(source.id) }
          })
          resolved = nodeInput(effectiveNodeDescriptor(node, provider), inputMessages, triggerInput, blueprint)
        } catch (error) {
          record.status = controller.signal.aborted ? 'CANCELLED' : 'FAILED'; record.error = message(error); record.finishedAt = new Date().toISOString()
          throw error
        }
        record.input = clone(resolved.input); record.inputPorts = clone(resolved.ports)
        const visit = { step: step + 1, iteration }
        if (writer !== undefined) record.artifacts!.push(...await writer.writeNodeInput(node.id, resolved.input, resolved.ports, visit))
        publish()
        const retry = typeof node.config.retry === 'number' && Number.isFinite(node.config.retry) ? Math.max(0, Math.min(10, Math.floor(node.config.retry))) : 0
        const timeoutMs = typeof node.config.timeoutMs === 'number' && Number.isFinite(node.config.timeoutMs) ? Math.max(1, node.config.timeoutMs) : engine.defaultTimeoutMs
        try {
          for (let attempt = 1; ; attempt += 1) {
            record.attempts = attempt
            let activeAttempt = true
            try {
              const result = await runWithTimeout(signal => provider.execute({ executionId: execution.id, workflow: definition, node: resolveNodeConfig(node, provider, resolved.ports),
                ...(output.call === undefined ? {} : { callId: output.call.id }),
                ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
                input: clone(resolved.input), inputs: clone(resolved.ports), vars: clone(snapshotState), state: clone(snapshotState), step: step + 1, iteration, signal,
                ...(own(interrupts, node.id) && own(options.resumeValues ?? {}, node.id) ? { resume: { value: clone(options.resumeValues![node.id]!) } } : {}),
                ...(writer === undefined ? {} : { outputDir: writer.outputDir + '/nodes/' + safeOutputSegment(node.id) + '/steps/' + visit.step + '-' + visit.iteration, intermediateDir: writer.intermediateRoot + '/' + safeOutputSegment(node.id) + '/' + visit.step + '-' + visit.iteration }),
                log(text, data, level = 'info') { if (!accepting || !activeAttempt) return; record.logs!.push({ timestamp: new Date().toISOString(), level, message: text, ...(data === undefined ? {} : { data: clone(data) }) }); publish() },
                async writeIntermediate(label, value, portId) {
                  if (!accepting || !activeAttempt || signal.aborted) throw new WorkflowExecutionError('Node execution is no longer active', 'FLOW_CANCELLED')
                  const artifact = writer === undefined ? memoryArtifact(execution.id, node.id, label, value, portId) : await writer.writeIntermediate(node.id, label, value, portId, visit)
                  if (accepting && activeAttempt) { record.artifacts!.push(clone(artifact)); publish() }
                  return artifact
                },
              }), timeoutMs, controller.signal, engine.onNodeTask)
              output.result = normalize(result, provider, resolved.input)
              if (blueprint && blueprintExecutionKind(provider) === 'pure' && output.result.control !== undefined) {
                throw new WorkflowExecutionError('Pure provider cannot return a control envelope: ' + node.type, 'FLOW_PURE_CONTROL')
              }
              break
            } catch (error) { if (controller.signal.aborted || attempt > retry) throw error }
            finally { activeAttempt = false }
          }
          record.output = clone(output.result!.output); record.outputPorts = clone(output.result!.ports)
          record.status = output.result!.control !== undefined && own(output.result!.control!, 'interrupt') ? 'PAUSED' : 'SUCCESS'
        } catch (error) { record.status = controller.signal.aborted ? 'CANCELLED' : 'FAILED'; record.error = message(error); throw error }
        finally {
          record.finishedAt = new Date().toISOString(); record.durationMs = Date.now() - new Date(record.startedAt!).getTime()
          if (writer !== undefined) record.artifacts!.push(...await writer.writeNodeRecord(record))
          publish()
        }
        return output.result
      }
      for (let offset = 0; offset < ready.length; offset += parallel) {
        const settled = await Promise.allSettled(ready.slice(offset, offset + parallel).map(item => run(item)))
        const rejected = settled.find(result => result.status === 'rejected')
        if (rejected?.status === 'rejected') throw rejected.reason
      }
      results.sort((left, right) => definition.nodes.indexOf(left.node) - definition.nodes.indexOf(right.node) || left.record.iteration! - right.record.iteration!)
      // No shared state is changed before every successful writer in this step is known.
      const updates = results.flatMap(item => item.record.status === 'SUCCESS' && item.result?.control?.update !== undefined ? [item.result.control.update] : [])
      state = reduceState(state, updates, definition)
      for (const item of results) {
        const { node, record, result } = item
        iterations[node.id] = Math.max(iterations[node.id] ?? 0, record.iteration!)
        if (record.evaluatedFor !== undefined) continue
        if (record.status === 'PAUSED') {
          interrupts[node.id] = clone(result!.control!.interrupt ?? null)
          if (blueprint) pending.unshift(...clone(item.messages))
          else pending.push(...clone(item.messages))
          continue
        }
        delete interrupts[node.id]
        if (result === undefined) continue
        lastOutputs[node.id] = clone(result.output); lastPortOutputs[node.id] = clone(result.ports); lastTerminalOutputs[node.id] = clone(result.terminalOutput)
        halted ||= result.control?.halt === true
        for (const [edgeIndex, edge] of definition.edges.entries()) {
          if (edge.from !== node.id) continue
          if (blueprint && !blueprintFlowEdge(edge, definition, resolve)) continue
          const sourcePort = edge.sourcePort ?? outputsFor(resolve(node.type)!)[0]?.id
          if (sourcePort === undefined || !own(result.ports, sourcePort)) continue
          if (result.control?.routes !== undefined && !result.control.routes.includes(sourcePort)) continue
          if (edge.condition !== undefined) {
            const matched = result.ports.matched ?? (object(result.output) ? result.output.matched : undefined)
            if (matched !== edge.condition) continue
          }
          pending.push({ nodeId: edge.to, edgeIndex, from: node.id, sourcePort, ...(edge.targetPort === undefined ? {} : { targetPort: edge.targetPort }), value: clone(result.ports[sourcePort]!),
            ...(item.call === undefined ? {} : { call: { id: item.call.id, outputs: { ...clone(item.call.outputs), [node.id]: clone(result.ports) } } }) })
        }
      }
      step += 1
      execution.steps!.push({ step, nodes: results.map(item => clone(item.record)), state: clone(state) })
      if (halted) { pending = []; for (const key of Object.keys(joins)) delete joins[key]; for (const key of Object.keys(interrupts)) delete interrupts[key] }
      if (Object.keys(interrupts).length > 0) execution.status = 'PAUSED'
      execution.checkpoint = makeCheckpoint()
      publish()
      await engine.onCheckpoint?.(clone(execution.checkpoint), clone(execution))
      if (execution.status === 'PAUSED' || halted) break
    }
    if (execution.status !== 'PAUSED') {
      execution.status = 'SUCCESS'
      const terminalNodes = definition.nodes.filter(node => own(lastOutputs, node.id) && (!definition.edges.some(edge => edge.from === node.id && (!blueprint || blueprintFlowEdge(edge, definition, resolve))) || node.type === 'control.end' || halted && records.get(node.id)?.step === step))
      const outputs = terminalNodes.map(node => [node.id, lastTerminalOutputs[node.id]!] as const)
      execution.output = outputs.length === 1 ? clone(outputs[0]![1]) : Object.fromEntries(outputs)
    }
  } catch (error) {
    execution.status = options.signal?.aborted || error instanceof WorkflowExecutionError && error.code === 'FLOW_CANCELLED' ? 'CANCELLED' : 'FAILED'
    execution.error = message(error)
  } finally {
    accepting = false
    applyLateCancellation()
    for (const record of records.values()) {
      if (record.status === 'WAITING' || record.status === 'RUNNING') {
        if (execution.status === 'PAUSED') continue
        record.status = execution.status === 'CANCELLED' ? 'CANCELLED' : 'SKIPPED'
        record.finishedAt = new Date().toISOString()
      }
    }
    if (execution.status !== 'PAUSED') execution.finishedAt = new Date().toISOString()
    publish()
    if (writer !== undefined) {
      try {
        execution.artifacts = await writer.finalize(clone(execution))
        if (applyLateCancellation()) {
          publish()
          execution.artifacts = await writer.finalize(clone(execution))
        }
      }
      catch (error) { execution.status = 'FAILED'; execution.error = 'Output persistence failed: ' + message(error) }
    }
    options.signal?.removeEventListener('abort', relayAbort)
    publish()
  }
  return clone(execution)
}

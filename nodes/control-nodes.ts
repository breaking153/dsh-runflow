import type { JsonObject, JsonValue, NodeExecutionContext, WorkflowNodeDefinition } from '../src/contracts.ts'

const reserved = new Set(['__proto__', 'constructor', 'prototype'])
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const input = { id: 'input', type: 'any' as const, multiple: true }
const ports = (...ids: string[]) => ids.map(id => ({ id, label: id, type: 'any' as const }))

function payload(context: NodeExecutionContext): JsonValue {
  const raw = Array.isArray(context.input) && context.input.length === 1 ? context.input[0]! : context.input
  return isObject(raw) && raw.$runflow === 'flow' && Object.hasOwn(raw, 'payload') ? raw.payload! : raw
}

export function readStatePath(value: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = value
  for (const key of path.split('.').filter(Boolean)) {
    if (reserved.has(key)) throw new Error('Path contains a reserved key')
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key)) return undefined
    current = Array.isArray(current) ? current[Number(key)] : current[key]
  }
  return current
}

function same(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => same(item, right[index]))
  if (isObject(left) && isObject(right)) return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => Object.hasOwn(right, key) && same(left[key], right[key]))
  return false
}

function matches(value: JsonValue, rule: JsonObject): boolean {
  const path = typeof rule.path === 'string' ? rule.path : ''
  const selected = readStatePath(value, path)
  switch (rule.operator ?? 'equals') {
    case 'equals': return same(selected, rule.value)
    case 'notEquals': return !same(selected, rule.value)
    case 'contains': return typeof selected === 'string' && typeof rule.value === 'string' ? selected.includes(rule.value) : Array.isArray(selected) && selected.some(item => same(item, rule.value))
    case 'greaterThan': return typeof selected === 'number' && typeof rule.value === 'number' && selected > rule.value
    case 'lessThan': return typeof selected === 'number' && typeof rule.value === 'number' && selected < rule.value
    case 'exists': return selected !== undefined
    case 'truthy': return Boolean(selected)
    default: throw new Error('Unknown comparison operator')
  }
}

function source(context: NodeExecutionContext): JsonValue {
  const selected = context.node.config.source ?? 'input'
  if (selected === 'state') return context.state ?? {}
  if (selected === 'input') return payload(context)
  if (selected === 'value') return context.node.config.value ?? null
  throw new Error('Unknown value source')
}

function integer(config: JsonObject, key: string, fallback: number, min: number, max: number): number {
  const value = config[key] ?? fallback
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new Error(key + ' must be an integer between ' + min + ' and ' + max)
  return value
}

const base = { category: 'logic' as const, group: 'Core/State Graph', color: '#a78bfa', icon: 'git-branch', inputs: [input], outputs: ports('output') }
const comparisonSchema: JsonObject = { type: 'object', properties: { source: { type: 'string', enum: ['input', 'state'], default: 'input' }, path: { type: 'string', default: '' }, operator: { type: 'string', enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'exists', 'truthy'], default: 'equals' }, value: {} } }

/** JSON-only control nodes for the native state-graph runtime. */
export function controlNodeDefinitions(): WorkflowNodeDefinition[] {
  return [
    {
      ...base, type: 'control.branch', title: 'Branch', description: 'Activate exactly one true or false branch using input or shared state.', outputs: ports('true', 'false'), configSchema: comparisonSchema,
      async execute(context) {
        const route = matches(source(context), context.node.config) ? 'true' : 'false'
        return { $runflow: 'control', outputs: { [route]: payload(context) }, routes: [route] }
      },
    },
    {
      ...base, type: 'control.switch', title: 'Route by Rules', icon: 'split', description: 'Select the first of four rules, or the default branch.', outputs: ports('case1', 'case2', 'case3', 'case4', 'default'),
      configSchema: { type: 'object', properties: { source: { type: 'string', enum: ['input', 'state'], default: 'input' }, rules: { type: 'array', maxItems: 4, items: comparisonSchema } } },
      async execute(context) {
        const rules = context.node.config.rules ?? []
        if (!Array.isArray(rules) || rules.length > 4 || rules.some(rule => !isObject(rule))) throw new Error('Switch requires at most four object rules')
        const index = rules.findIndex(rule => matches(source(context), rule as JsonObject))
        const route = index < 0 ? 'default' : 'case' + (index + 1)
        return { $runflow: 'control', outputs: { [route]: payload(context) }, routes: [route] }
      },
    },
    {
      ...base, type: 'control.parallel', title: 'Parallel Branches', icon: 'workflow', description: 'Activate two to four independent branches in the next step.', outputs: ports('branch1', 'branch2', 'branch3', 'branch4'),
      configSchema: { type: 'object', properties: { branchCount: { type: 'integer', minimum: 1, maximum: 4, default: 2 } } },
      async execute(context) {
        const count = integer(context.node.config, 'branchCount', 2, 1, 4)
        const routes = Array.from({ length: count }, (_, index) => 'branch' + (index + 1))
        return { $runflow: 'control', outputs: Object.fromEntries(routes.map(route => [route, payload(context)])), routes }
      },
    },
    {
      ...base, type: 'control.join', title: 'Join All Branches', icon: 'combine', description: 'Wait for one new message from every incoming edge; use only for branches that all run.', activation: 'all',
      async execute(context) { return { $runflow: 'control', outputs: { output: context.input } } },
    },
    {
      ...base, type: 'control.loop', title: 'Bounded Loop', icon: 'repeat-2', description: 'Continue while a comparison passes, up to the configured iteration limit.', outputs: ports('continue', 'done'),
      configSchema: { ...comparisonSchema, properties: { ...(comparisonSchema.properties as JsonObject), maxIterations: { type: 'integer', minimum: 0, maximum: 1000, default: 10 } } },
      async execute(context) {
        const max = integer(context.node.config, 'maxIterations', 10, 0, 1000)
        const configured = context.node.config.path !== undefined || context.node.config.operator !== undefined
        const continuing = (context.iteration ?? 1) <= max && (!configured || matches(source(context), context.node.config))
        const route = continuing ? 'continue' : 'done'
        return { $runflow: 'control', outputs: { [route]: payload(context) }, routes: [route] }
      },
    },
    {
      ...base, type: 'state.read', title: 'Read State', category: 'data', color: '#38bdf8', icon: 'database', description: 'Read a shared state field after the previous step has committed.',
      configSchema: { type: 'object', properties: { path: { type: 'string', default: '' } } },
      async execute(context) { return { $runflow: 'control', outputs: { output: readStatePath(context.state ?? {}, typeof context.node.config.path === 'string' ? context.node.config.path : '') ?? null } } },
    },
    {
      ...base, type: 'state.update', title: 'Update State', category: 'data', color: '#38bdf8', icon: 'list-plus', description: 'Update one shared state key using its workflow reducer.',
      configSchema: { type: 'object', properties: { key: { type: 'string', default: 'result' }, source: { type: 'string', enum: ['input', 'value', 'state'], default: 'input' }, path: { type: 'string', default: '' }, value: {} } },
      async execute(context) {
        const key = context.node.config.key ?? 'result'
        if (typeof key !== 'string' || key.length === 0 || reserved.has(key)) throw new Error('State update requires a non-reserved key')
        const selected = readStatePath(source(context), typeof context.node.config.path === 'string' ? context.node.config.path : '') ?? null
        return { $runflow: 'control', update: { [key]: selected }, outputs: { output: payload(context) } }
      },
    },
    {
      ...base, type: 'control.end', title: 'End Branch', icon: 'circle-stop', description: 'Finish this branch with its current value; other active branches can finish.',
      async execute(context) { return { $runflow: 'control', outputs: { output: payload(context) }, routes: [] } },
    },
    {
      ...base, type: 'control.interrupt', title: 'Pause for Input', icon: 'pause', description: 'Persist a checkpoint and wait for a Host-authorized response before continuing.',
      configSchema: { type: 'object', properties: { prompt: { default: 'Review before continuing' }, stateKey: { type: 'string', default: 'approval' } } },
      async execute(context) {
        if (context.resume === undefined) return { $runflow: 'control', interrupt: context.node.config.prompt ?? 'Review before continuing' }
        const key = context.node.config.stateKey ?? 'approval'
        if (typeof key !== 'string' || key.length === 0 || reserved.has(key)) throw new Error('Interrupt stateKey must be a non-reserved key')
        return { $runflow: 'control', update: { [key]: context.resume.value }, outputs: { output: context.resume.value } }
      },
    },
  ]
}

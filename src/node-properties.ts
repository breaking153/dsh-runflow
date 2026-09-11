import type { JsonObject, JsonValue, WorkflowNode, WorkflowNodeDescriptor, WorkflowPortDescriptor, WorkflowPortType } from './contracts.ts'

export interface ConfigurableProperty {
  key: string
  label: string
  type: WorkflowPortType
  schema: JsonObject
}

const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const reserved = new Set(['__proto__', 'prototype', 'constructor'])
// These are scheduler controls, not arguments resolved inside a node invocation.
const schedulerProperties = new Set(['retry', 'timeoutMs'])

const stringProperty = (title: string, extra: JsonObject = {}): JsonObject => ({ title, type: 'string', ...extra })
const comparisonProperties: JsonObject = {
  path: stringProperty('Input path', { default: '' }),
  operator: stringProperty('Operator', { default: 'equals', enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan'] }),
  value: { title: 'Compare value' },
}

// The inspector and Host use the same argument declarations even before a live
// provider catalog arrives. Provider configSchema remains authoritative.
const builtinProperties: Record<string, JsonObject> = {
  'http.request': {
    url: stringProperty('URL', { minLength: 1 }),
    method: stringProperty('Method', { default: 'GET' }),
    headers: { title: 'Headers', type: 'object', additionalProperties: { type: ['string', 'number', 'boolean'] } },
    body: { title: 'Request body' },
  },
  'builtin.condition': comparisonProperties,
  'builtin.filter': comparisonProperties,
  'builtin.set': { values: { title: 'Fields', type: 'object', default: {} } },
  'builtin.limit': { maxItems: { title: 'Max items', type: 'integer', minimum: 0, default: 10 } },
  'builtin.switch': { rules: { title: 'Rules', type: 'array', items: { type: 'object', properties: comparisonProperties } } },
  'builtin.sort': { path: stringProperty('Sort path', { default: '' }), order: stringProperty('Order', { enum: ['asc', 'desc'], default: 'asc' }) },
  'builtin.aggregate': { path: stringProperty('Value path', { default: '' }),
    operation: stringProperty('Operation', { enum: ['count', 'sum', 'average', 'min', 'max'], default: 'count' }) },
  'builtin.json-stringify': { pretty: { title: 'Pretty formatting', type: 'boolean', default: false } },
  'builtin.wait': { durationMs: { title: 'Duration (ms)', type: 'integer', minimum: 0, maximum: 3_600_000, default: 1000 } },
  'builtin.stop-error': { message: stringProperty('Error message', { default: 'Workflow stopped by Stop & Error' }) },
  'script.javascript': { description: stringProperty('Execution description'), code: stringProperty('JavaScript code', { minLength: 1 }) },
  'storage.write': { collection: stringProperty('Collection', { default: 'workflow-results' }) },
  'dsh.agent': {
    subagentProvider: stringProperty('Subagent provider'), label: stringProperty('Child label'),
    agentOptions: { title: 'Agent options', type: 'object', additionalProperties: false, properties: {
      provider: stringProperty('Model provider'), model: stringProperty('Model ID'),
      reasoningEffort: stringProperty('Reasoning effort'), maxTokens: { title: 'Max tokens', type: 'integer', minimum: 1 },
    } },
    outputSchema: { title: 'Output schema', type: 'object' },
    maxDepth: { title: 'Max depth', type: 'integer', minimum: 0 },
    toolFilter: { title: 'Tool filter', type: 'object', additionalProperties: false, properties: {
      allow: { title: 'Tool allow', type: 'array', items: { type: 'string' } },
      deny: { title: 'Tool deny', type: 'array', items: { type: 'string' } },
    } },
    persona: stringProperty('Persona'), prompt: stringProperty('Prompt'),
  },
}

function mergeProperties(fallback: JsonObject, declared: JsonObject): JsonObject {
  const result: JsonObject = { ...fallback }
  for (const [key, schema] of Object.entries(declared)) {
    if (reserved.has(key)) continue
    if (!object(schema)) { result[key] = schema; continue }
    const previous = Object.hasOwn(fallback, key) && object(fallback[key]) ? fallback[key] : {}
    const merged = { ...previous, ...schema }
    if (object(previous.properties) && object(schema.properties)) merged.properties = mergeProperties(previous.properties, schema.properties)
    result[key] = merged
  }
  return result
}

function propertyLabel(key: string): string {
  return key.split('.').map(segment => {
    const words = segment.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
  }).join(' · ')
}

function validPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.split('.').every(segment => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(segment) && !reserved.has(segment))
}

/** Structural check used at persistence boundaries before a provider is available. */
export function validPromotedInputs(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(validPath) && new Set(value).size === value.length
    && !value.some((key: string) => value.some((other: string) => other !== key && other.startsWith(key + '.')))
}

/** Escaping every non-lowercase-alphanumeric character makes the mapping injective. */
export function promotedPortId(key: string): string {
  if (!validPath(key)) throw new Error('Invalid property path: ' + key)
  return 'property-' + key.replace(/[^a-z0-9]/g, character => '_' + character.charCodeAt(0).toString(16) + '_')
}

export function readConfigProperty(config: JsonObject, key: string): JsonValue | undefined {
  if (!validPath(key)) return undefined
  let value: JsonValue | undefined = config
  for (const segment of key.split('.')) {
    if (!object(value) || !Object.hasOwn(value, segment)) return undefined
    value = value[segment]
  }
  return value
}

function portType(schema: JsonObject): WorkflowPortType {
  const kinds = Array.isArray(schema.type) ? schema.type.filter(kind => kind !== 'null') : [schema.type]
  if (kinds.length !== 1) return 'any'
  switch (kinds[0]) {
    case 'string': return 'text'
    case 'integer': case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'object': case 'array': return 'json'
    default: return 'any'
  }
}

function containsReadOnly(schema: JsonObject, depth = 0): boolean {
  if (schema.readOnly === true || depth > 16) return true
  const children: unknown[] = object(schema.properties) ? Object.values(schema.properties) : []
  children.push(schema.items, schema.additionalProperties)
  return children.some(child => object(child) && containsReadOnly(child, depth + 1))
}

/** Includes declared object paths and their children; overlapping promotions are rejected. */
export function configurableProperties(descriptor: WorkflowNodeDescriptor): ConfigurableProperty[] {
  // Trigger listener configuration belongs to Host ingress, not the invoked payload.
  if (descriptor.type.startsWith('trigger.') || descriptor.configSchema?.readOnly === true) return []
  const properties: ConfigurableProperty[] = []
  const walk = (schemas: JsonObject, prefix = '', depth = 0): void => {
    if (depth > 16) return
    for (const [segment, value] of Object.entries(schemas)) {
      const key = prefix + segment
      if (segment.includes('.') || !validPath(key) || schedulerProperties.has(key.split('.')[0]!) || !object(value) || value.readOnly === true) continue
      const schema = structuredClone(value)
      // A whole-object replacement must not bypass a protected child. Mutable
      // child paths remain independently eligible below this parent.
      if (!containsReadOnly(schema)) properties.push({ key, label: typeof schema.title === 'string' ? schema.title : propertyLabel(key), type: portType(schema), schema })
      if (object(schema.properties)) walk(schema.properties, key + '.', depth + 1)
    }
  }
  const fallback = Object.hasOwn(builtinProperties, descriptor.type) ? builtinProperties[descriptor.type]! : {}
  walk(mergeProperties(fallback, object(descriptor.configSchema?.properties) ? descriptor.configSchema.properties : {}))
  return properties
}

function promotedProperties(node: Pick<WorkflowNode, 'promotedInputs'>, descriptor: WorkflowNodeDescriptor): ConfigurableProperty[] {
  if (node.promotedInputs === undefined) return []
  if (!validPromotedInputs(node.promotedInputs)) throw new Error('Promoted inputs contain malformed, duplicate, overlapping, or reserved property paths')
  const available = new Map(configurableProperties(descriptor).map(property => [property.key, property]))
  return node.promotedInputs.map(key => {
    const property = available.get(key)
    if (property === undefined) throw new Error('Unknown or ineligible configuration property: ' + key)
    if (descriptor.inputs?.some(port => port.id === promotedPortId(key))) throw new Error('Promoted property collides with an input port: ' + key)
    return property
  })
}

export function effectiveNodeDescriptor<T extends WorkflowNodeDescriptor>(node: Pick<WorkflowNode, 'promotedInputs'>, descriptor: T): T {
  const properties = promotedProperties(node, descriptor)
  if (properties.length === 0) return { ...descriptor }
  const inputs: WorkflowPortDescriptor[] = [...(descriptor.inputs ?? [{ id: 'input', type: 'any' as const }]),
    ...properties.map(property => ({ id: promotedPortId(property.key), label: property.label,
      type: property.type, configKey: property.key,
      ...(typeof property.schema.description === 'string' ? { description: property.schema.description } : {}) }))]
  return { ...descriptor, inputs }
}

function matchesType(value: JsonValue, type: JsonValue | undefined): boolean {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isSafeInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'null': return value === null
    case 'object': return object(value)
    case 'array': return Array.isArray(value)
    default: return true
  }
}

function jsonValue(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value)) return false
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false
  ancestors.add(value)
  const children: unknown[] = Array.isArray(value) ? [...value] : Object.values(value)
  const valid = children.every(child => jsonValue(child, ancestors))
  ancestors.delete(value)
  return valid
}

function equalValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => equalValue(value, right[index]!))
  if (object(left) && object(right)) return Object.keys(left).length === Object.keys(right).length
    && Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && equalValue(value, right[key]!))
  return false
}

function validateValue(value: JsonValue, schema: JsonObject, key: string): void {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type]
  if (!types.some(type => matchesType(value, type))) throw new Error('Property ' + key + ' must match ' + types.join(' or '))
  if (Array.isArray(schema.enum) && !schema.enum.some(item => equalValue(item, value))) throw new Error('Property ' + key + ' is not an allowed value')
  if (typeof value === 'number' && (typeof schema.minimum === 'number' && value < schema.minimum || typeof schema.maximum === 'number' && value > schema.maximum)) throw new Error('Property ' + key + ' is outside its allowed range')
  if (typeof value === 'string' && (typeof schema.minLength === 'number' && [...value].length < schema.minLength || typeof schema.maxLength === 'number' && [...value].length > schema.maxLength)) throw new Error('Property ' + key + ' has an invalid length')
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems || typeof schema.maxItems === 'number' && value.length > schema.maxItems) throw new Error('Property ' + key + ' has an invalid item count')
    if (object(schema.items)) for (const [index, item] of value.entries()) validateValue(item, schema.items, key + '[' + index + ']')
  }
  if (object(value)) {
    const children = object(schema.properties) ? schema.properties : {}
    if (Array.isArray(schema.required) && schema.required.some(name => typeof name === 'string' && !Object.hasOwn(value, name))) throw new Error('Property ' + key + ' is missing a required field')
    for (const [name, item] of Object.entries(value)) {
      if (Object.hasOwn(children, name) && object(children[name])) validateValue(item, children[name], key + '.' + name)
      else if (schema.additionalProperties === false) throw new Error('Property ' + key + ' contains an unknown field: ' + name)
      else if (object(schema.additionalProperties)) validateValue(item, schema.additionalProperties, key + '.' + name)
    }
  }
}

/** Resolve wired values or absent promoted defaults on a clone; saved fallback config stays untouched. */
export function resolveNodeConfig<T extends WorkflowNode>(node: T, descriptor: WorkflowNodeDescriptor, inputs: Readonly<JsonObject>): T {
  const properties = promotedProperties(node, descriptor)
  const resolved = structuredClone(node)
  for (const property of properties) {
    const id = promotedPortId(property.key)
    const wired = Object.hasOwn(inputs, id)
    if (!wired && (readConfigProperty(node.config, property.key) !== undefined || !Object.hasOwn(property.schema, 'default'))) continue
    const value = wired ? inputs[id]! : property.schema.default!
    if (!jsonValue(value)) throw new Error('Property ' + property.key + ' must be a JSON value')
    validateValue(value, property.schema, property.key)
    const segments = property.key.split('.')
    let config = resolved.config
    for (const segment of segments.slice(0, -1)) {
      const current = Object.hasOwn(config, segment) ? config[segment] : undefined
      if (current !== undefined && !object(current)) throw new Error('Property ' + property.key + ' has a non-object parent')
      if (current === undefined) config[segment] = {}
      config = config[segment] as JsonObject
    }
    config[segments.at(-1)!] = structuredClone(value)
  }
  return resolved
}

import { describe, expect, it } from 'vitest'
import type { JsonObject, JsonValue, WorkflowNode, WorkflowNodeDescriptor } from '../src/contracts.ts'
import { configurableProperties, effectiveNodeDescriptor, promotedPortId, readConfigProperty, resolveNodeConfig } from '../src/node-properties.ts'
import { builtinNodeDefinitions } from '../nodes/builtins.ts'

const descriptor = (type: string, configSchema?: JsonObject): WorkflowNodeDescriptor => ({ type, title: type,
  description: type, category: 'data', color: '#123456', icon: 'test', ...(configSchema === undefined ? {} : { configSchema }) })
const node = (config: JsonObject, promotedInputs: string[]): WorkflowNode => ({ id: 'node', type: 'test', config, promotedInputs })

describe('declared configurable properties', () => {
  it('supplies HTTP properties consistently when the descriptor has no config schema', () => {
    const properties = configurableProperties(descriptor('http.request'))
    expect(properties).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'url', label: 'URL', type: 'text', schema: expect.objectContaining({ type: 'string' }) }),
      expect.objectContaining({ key: 'method', type: 'text', schema: expect.objectContaining({ default: 'GET' }) }),
      expect.objectContaining({ key: 'headers', type: 'json' }), expect.objectContaining({ key: 'body', type: 'any' }),
    ]))
  })

  it('provides nested Agent fields with array item validation even before Host metadata loads', () => {
    const properties = configurableProperties(descriptor('dsh.agent'))
    expect(properties).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'agentOptions.model', type: 'text' }),
      expect.objectContaining({ key: 'agentOptions.maxTokens', type: 'number' }),
      expect.objectContaining({ key: 'toolFilter.allow', type: 'json', schema: expect.objectContaining({ items: { type: 'string' } }) }),
    ]))
    expect(() => resolveNodeConfig(node({}, ['toolFilter.allow']), descriptor('dsh.agent'),
      { [promotedPortId('toolFilter.allow')]: ['valid', 7] })).toThrow(/toolFilter.allow\[1\].*string/)
    const host = builtinNodeDefinitions(async () => null).find(item => item.type === 'dsh.agent')!
    expect(() => resolveNodeConfig(node({}, ['toolFilter.allow']), host,
      { [promotedPortId('toolFilter.allow')]: [7] })).toThrow(/string/)
  })

  it('exposes actual built-in execution settings and descriptive labels', () => {
    for (const [type, key, expectedType] of [
      ['builtin.set', 'values', 'json'], ['builtin.condition', 'value', 'any'], ['builtin.filter', 'path', 'text'],
      ['builtin.limit', 'maxItems', 'number'], ['builtin.switch', 'rules', 'json'], ['builtin.sort', 'order', 'text'],
      ['builtin.aggregate', 'operation', 'text'], ['builtin.json-stringify', 'pretty', 'boolean'],
      ['builtin.wait', 'durationMs', 'number'], ['builtin.stop-error', 'message', 'text'],
      ['script.javascript', 'code', 'text'], ['storage.write', 'collection', 'text'],
    ]) {
      expect(configurableProperties(descriptor(type!))).toContainEqual(expect.objectContaining({ key, type: expectedType }))
    }
    expect(configurableProperties(descriptor('builtin.wait'))[0]?.label).toBe('Duration (ms)')
  })

  it('excludes scheduling controls, read-only fields, and Host-owned trigger settings', () => {
    const schema = { properties: { retry: { type: 'integer' }, timeoutMs: { type: 'number' },
      label: { type: 'string' }, internal: { type: 'string', readOnly: true } } }
    expect(configurableProperties(descriptor('custom.example', schema)).map(item => item.key)).toEqual(['label'])
    expect(configurableProperties(descriptor('trigger.webhook', { properties: { token: { type: 'string' } } }))).toEqual([])
  })

  it('keeps generated IDs distinct for paths and literal escaping characters', () => {
    const ids = ['url', 'agentOptions.model', 'a.b', 'a_2e_b', 'a-b', 'a_b'].map(promotedPortId)
    expect(ids.every(id => /^[a-z][a-z0-9_-]*$/.test(id))).toBe(true)
    expect(new Set(ids).size).toBe(6)
    expect(promotedPortId('url')).toBe('property-url')
  })

  it('protects nested read-only settings while permitting individual mutable siblings', () => {
    const custom = descriptor('custom.example', { properties: { options: { type: 'object', properties: {
      label: { type: 'string' }, nested: { type: 'object', properties: { secret: { type: 'string', readOnly: true } } },
    } } } })
    expect(configurableProperties(custom).map(property => property.key)).toEqual(['options.label'])
    const original = node({ options: { label: 'old', nested: { secret: 'fixed' } } }, ['options.label'])
    expect(resolveNodeConfig(original, custom, { [promotedPortId('options.label')]: 'new' }).config)
      .toEqual({ options: { label: 'new', nested: { secret: 'fixed' } } })
    expect(() => resolveNodeConfig(node(original.config, ['options']), custom, { 'property-options': {} })).toThrow(/ineligible/)
  })

  it('does not expose arrays or dictionaries with protected descendants, or a read-only configuration', () => {
    const custom = descriptor('custom.example', { properties: {
      rows: { type: 'array', items: { type: 'object', properties: { locked: { readOnly: true } } } },
      map: { type: 'object', additionalProperties: { type: 'object', properties: { locked: { readOnly: true } } } },
    } })
    expect(configurableProperties(custom)).toEqual([])
    expect(configurableProperties(descriptor('custom.example', { readOnly: true, properties: { label: { type: 'string' } } }))).toEqual([])
  })

  it('preserves legacy default ports and rejects collisions and overlapping parent bindings', () => {
    const custom = descriptor('custom.example', { properties: { options: { type: 'object', properties: { label: { type: 'string' } } } } })
    const effective = effectiveNodeDescriptor(node({}, ['options.label']), custom)
    expect(effective.inputs).toEqual([
      { id: 'input', type: 'any' }, expect.objectContaining({ id: 'property-options_2e_label', type: 'text', configKey: 'options.label' }),
    ])
    expect(custom.inputs).toBeUndefined()
    expect(() => effectiveNodeDescriptor(node({}, ['options', 'options.label']), custom)).toThrow(/overlapping/)
    expect(() => effectiveNodeDescriptor(node({}, ['options.label']), { ...custom,
      inputs: [{ id: 'property-options_2e_label', type: 'text' }] })).toThrow(/collides/)
  })

  it('reads only own nested configuration properties', () => {
    expect(readConfigProperty({ options: { enabled: false } }, 'options.enabled')).toBe(false)
    expect(readConfigProperty({}, 'toString')).toBeUndefined()
    expect(readConfigProperty({}, '__proto__.polluted')).toBeUndefined()
  })

  it('does not mistake a literal dotted schema key for a declared nested path', () => {
    const custom = descriptor('custom.example', { properties: { 'options.label': { type: 'string' } } })
    expect(configurableProperties(custom)).toEqual([])
    expect(() => effectiveNodeDescriptor(node({}, ['options.label']), custom)).toThrow(/Unknown/)
  })

  it.each([
    [{ type: 'object', properties: { count: { type: 'integer' } } }, { count: 0.5 }],
    [{ type: 'array', items: { type: 'boolean' } }, [true, 'false']],
    [{ type: 'number', minimum: 0 }, -1], [{ type: 'string', enum: ['GET', 'POST'] }, 'DELETE'],
  ] satisfies [JsonObject, JsonValue][])('rejects invalid wired values using declared nested schema %j', (schema, value) => {
    const custom = descriptor('custom.example', { properties: { value: schema } })
    expect(() => resolveNodeConfig(node({}, ['value']), custom, { 'property-value': value })).toThrow(/Property value/)
  })

  it('preserves siblings while creating nested config and accepts nullable declared values', () => {
    const custom = descriptor('custom.example', { properties: { options: { type: 'object', properties: { value: { type: ['string', 'null'] } } } } })
    const original = node({ options: { other: true } }, ['options.value'])
    expect(resolveNodeConfig(original, custom, { 'property-options_2e_value': null }).config).toEqual({ options: { other: true, value: null } })
    expect(original.config).toEqual({ options: { other: true } })
    expect(() => resolveNodeConfig(node({ options: false }, ['options.value']), custom,
      { 'property-options_2e_value': 'label' })).toThrow(/non-object parent/)
  })

  it('allows ordinary JSON keys in a bound value without changing any object prototype', () => {
    const custom = descriptor('custom.example', { properties: { value: {} } })
    const value = JSON.parse('{"constructor":"metadata","__proto__":{"propertyPolluted":true}}') as JsonValue
    const result = resolveNodeConfig(node({}, ['value']), custom, { 'property-value': value })
    expect(result.config.value).toEqual(value)
    expect(Object.getPrototypeOf(result.config)).toBe(Object.prototype)
    expect(Object.hasOwn(Object.prototype, 'propertyPolluted')).toBe(false)
  })

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, new Date(), { nested: undefined }])('rejects values outside the JSON property contract: %j', value => {
    const custom = descriptor('custom.example', { properties: { value: {} } })
    expect(() => resolveNodeConfig(node({}, ['value']), custom, { 'property-value': value as JsonValue })).toThrow(/JSON/)
  })

  it('checks declared string length and compares object enum members by value', () => {
    const custom = descriptor('custom.example', { properties: { label: { type: 'string', minLength: 1 },
      value: { enum: [{ a: 1, b: 2 }] } } })
    expect(() => resolveNodeConfig(node({}, ['label']), custom, { 'property-label': '' })).toThrow(/length/)
    expect(resolveNodeConfig(node({}, ['value']), custom, { 'property-value': { b: 2, a: 1 } }).config.value).toEqual({ a: 1, b: 2 })
  })
})

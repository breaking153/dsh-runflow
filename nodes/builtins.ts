import type {
  JsonObject,
  JsonValue,
  NodeExecutionContext,
  WorkflowNodeDefinition,
} from '../src/contracts.ts'

export type AgentNodeExecutor = (context: NodeExecutionContext) => Promise<JsonValue>

function objectConfig(value: JsonValue | undefined): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {}
}

function readPath(value: JsonValue, path: string): JsonValue | undefined {
  let cursor: JsonValue | undefined = value
  for (const part of path.split('.').filter(Boolean)) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) return undefined
    cursor = cursor[part]
  }
  return cursor
}

function compare(left: JsonValue | undefined, operator: string, right: JsonValue | undefined): boolean {
  switch (operator) {
    case 'notEquals': return left !== right
    case 'contains': return typeof left === 'string' && typeof right === 'string' && left.includes(right)
    case 'greaterThan': return typeof left === 'number' && typeof right === 'number' && left > right
    case 'lessThan': return typeof left === 'number' && typeof right === 'number' && left < right
    default: return left === right
  }
}

const jsonInput = { id: 'json', label: 'json', type: 'json' as const }
const jsonOutput = { id: 'json', label: 'json', type: 'json' as const }
const flowInput = { id: 'flow', label: 'flow', type: 'flow' as const }
const flowOutput = { id: 'output', label: 'flow', type: 'flow' as const }
const passThrough = async ({ input: value }: { input: JsonValue }): Promise<JsonValue> => value
const unavailableTrigger = async (): Promise<JsonValue> => {
  throw new Error('This trigger requires a Host listener provider that is not installed')
}

function requestHeaders(value: JsonValue | undefined): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const headers: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      headers[key] = String(item)
    }
  }
  return headers
}

function flowSignal(trigger: string, payload: JsonValue): JsonObject {
  return { $runflow: 'flow', trigger, timestamp: new Date().toISOString(), payload }
}

function flowPayload(value: JsonValue): JsonValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && value['$runflow'] === 'flow' && Object.hasOwn(value, 'payload')
    ? value['payload'] ?? null
    : value
}

function selectedInput(inputs: Readonly<JsonObject>, fallback: JsonValue): JsonValue {
  for (const id of ['input', 'json', 'text', 'flow', 'body', 'date', 'timestamp']) {
    if (Object.hasOwn(inputs, id)) return inputs[id] ?? null
  }
  return fallback
}

function mergeJson(left: JsonValue | undefined, right: JsonValue | undefined): JsonValue {
  if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right]
  if (typeof left === 'object' && left !== null && !Array.isArray(left)
    && typeof right === 'object' && right !== null && !Array.isArray(right)) return { ...left, ...right }
  return [left ?? null, right ?? null]
}

function switchRule(value: JsonValue, candidate: JsonValue): boolean {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return false
  const path = typeof candidate['path'] === 'string' ? candidate['path'] : ''
  const operator = typeof candidate['operator'] === 'string' ? candidate['operator'] : 'equals'
  return compare(readPath(value, path), operator, candidate['value'])
}

function comparable(value: JsonValue | undefined): string | number {
  return typeof value === 'number' || typeof value === 'string' ? value : JSON.stringify(value ?? null)
}

function numericValues(value: JsonValue, path: string): number[] {
  const items = Array.isArray(value) ? value : [value]
  return items.flatMap(item => {
    const selected = path === '' ? item : readPath(item, path)
    return typeof selected === 'number' && Number.isFinite(selected) ? [selected] : []
  })
}

export function builtinNodeDefinitions(executeAgent: AgentNodeExecutor): WorkflowNodeDefinition[] {
  return [
    {
      type: 'trigger.manual',
      title: 'Manual Trigger',
      description: 'Run the workflow on demand.',
      category: 'trigger',
      color: '#22c55e',
      icon: 'mouse-pointer-click',
      inputs: [],
      outputs: [flowOutput],
      async execute({ input: value }) { return flowSignal('manual', value) },
    },
    {
      type: 'trigger.webhook',
      title: 'Webhook',
      description: 'Inbound listener is not installed; use Manual Trigger with Run Input.',
      category: 'trigger',
      color: '#22c55e',
      icon: 'webhook',
      inputs: [],
      outputs: [flowOutput],
      available: false,
      execute: unavailableTrigger,
    },
    {
      type: 'trigger.schedule',
      title: 'Schedule',
      description: 'Cron listener is not installed in the Host.',
      category: 'trigger',
      color: '#22c55e',
      icon: 'clock-3',
      inputs: [],
      outputs: [flowOutput],
      available: false,
      execute: unavailableTrigger,
    },
    {
      type: 'trigger.dsh-event',
      title: 'DSH Event',
      description: 'Cordis/DSH event subscription provider is not installed.',
      category: 'trigger',
      color: '#22c55e',
      icon: 'radio',
      inputs: [],
      outputs: [flowOutput],
      available: false,
      execute: unavailableTrigger,
    },
    {
      type: 'builtin.condition',
      title: 'Condition',
      description: 'Route data using a boolean comparison.',
      category: 'logic',
      color: '#a78bfa',
      icon: 'git-branch',
      inputs: [{ ...jsonInput, id: 'input', label: 'json' }],
      outputs: [
        { id: 'value', label: 'value', type: 'json' },
        { id: 'matched', label: 'matched', type: 'boolean' },
      ],
      async execute({ input: value, node }) {
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const operator = typeof node.config['operator'] === 'string' ? node.config['operator'] : 'equals'
        const matched = compare(readPath(value, path), operator, node.config['value'])
        return {
          $runflow: 'port-outputs',
          outputs: {
            value,
            matched,
          },
        }
      },
    },
    {
      type: 'builtin.set',
      title: 'Set Fields',
      description: 'Add or replace fields on an object.',
      category: 'data',
      color: '#38bdf8',
      icon: 'list-plus',
      inputs: [{ id: 'input', label: 'flow', type: 'flow' }, jsonInput],
      outputs: [{ ...jsonOutput, id: 'output', label: 'output' }],
      async execute({ input: value, inputs, node }) {
        return { ...objectConfig(inputs['json'] ?? flowPayload(value)), ...objectConfig(node.config['values']) }
      },
    },
    {
      type: 'builtin.filter',
      title: 'Filter',
      description: 'Keep JSON items matching a comparison.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#a78bfa',
      icon: 'filter',
      inputs: [jsonInput],
      outputs: [jsonOutput],
      async execute({ input: value, node }) {
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const operator = typeof node.config['operator'] === 'string' ? node.config['operator'] : 'equals'
        const keep = (item: JsonValue): boolean => compare(readPath(item, path), operator, node.config['value'])
        if (Array.isArray(value)) return value.filter(keep)
        return keep(value) ? value : null
      },
    },
    {
      type: 'builtin.merge',
      title: 'Merge',
      description: 'Merge two typed JSON inputs.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#a78bfa',
      icon: 'combine',
      inputs: [{ ...jsonInput, id: 'left', label: 'left' }, { ...jsonInput, id: 'right', label: 'right' }],
      outputs: [jsonOutput],
      async execute({ inputs }) { return mergeJson(inputs['left'], inputs['right']) },
    },
    {
      type: 'builtin.limit',
      title: 'Limit',
      description: 'Limit the number of items in a JSON array.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#a78bfa',
      icon: 'list-end',
      inputs: [jsonInput],
      outputs: [jsonOutput],
      async execute({ input: value, node }) {
        const raw = node.config['maxItems']
        const maxItems = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 10
        return Array.isArray(value) ? value.slice(0, maxItems) : value
      },
    },
    {
      type: 'builtin.date-time',
      title: 'Date & Time',
      description: 'Parse a text or numeric date input into typed outputs.',
      category: 'data',
      group: 'Core/Data',
      color: '#38bdf8',
      icon: 'calendar-clock',
      inputs: [{ id: 'date', label: 'date', type: 'text' }, { id: 'timestamp', label: 'timestamp', type: 'number' }],
      outputs: [{ id: 'iso', type: 'text' }, { id: 'timestamp', type: 'number' }, { id: 'parts', type: 'json' }],
      async execute({ input: value, inputs }) {
        const source = selectedInput(inputs, value)
        if (typeof source !== 'string' && typeof source !== 'number') throw new Error('Date & Time expects text or number input')
        const date = new Date(source)
        if (Number.isNaN(date.getTime())) throw new Error('Date & Time received an invalid date')
        return { $runflow: 'port-outputs', outputs: {
          iso: date.toISOString(),
          timestamp: date.getTime(),
          parts: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds() },
        } }
      },
    },
    {
      type: 'builtin.switch',
      title: 'Switch',
      description: 'Route JSON through the first matching rule or the fallback output.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#a78bfa',
      icon: 'split',
      inputs: [jsonInput],
      outputs: [
        { id: 'match', label: 'match', type: 'json' },
        { id: 'fallback', label: 'fallback', type: 'json' },
        { id: 'index', label: 'rule index', type: 'number' },
      ],
      async execute({ input: value, node }) {
        const rules = Array.isArray(node.config['rules']) ? node.config['rules'] : []
        const index = rules.findIndex(rule => switchRule(value, rule))
        return {
          $runflow: 'port-outputs',
          outputs: index < 0 ? { fallback: value, index } : { match: value, index },
        }
      },
    },
    {
      type: 'builtin.sort',
      title: 'Sort',
      description: 'Sort a JSON array by a nested field.',
      category: 'data',
      group: 'Core/Data',
      color: '#38bdf8',
      icon: 'arrow-down-up',
      inputs: [jsonInput],
      outputs: [jsonOutput],
      async execute({ input: value, node }) {
        if (!Array.isArray(value)) throw new Error('Sort expects a JSON array')
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const direction = node.config['order'] === 'desc' ? -1 : 1
        return [...value].sort((left, right) => {
          const a = comparable(path === '' ? left : readPath(left, path))
          const b = comparable(path === '' ? right : readPath(right, path))
          return (a < b ? -1 : a > b ? 1 : 0) * direction
        })
      },
    },
    {
      type: 'builtin.aggregate',
      title: 'Aggregate',
      description: 'Count or summarize numeric values in a JSON array.',
      category: 'data',
      group: 'Core/Data',
      color: '#38bdf8',
      icon: 'sigma',
      inputs: [jsonInput],
      outputs: [{ id: 'result', type: 'number' }, { id: 'items', type: 'json' }],
      async execute({ input: value, node }) {
        const items = Array.isArray(value) ? value : [value]
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const operation = typeof node.config['operation'] === 'string' ? node.config['operation'] : 'count'
        const values = numericValues(value, path)
        let result: number
        if (operation === 'sum') result = values.reduce((sum, item) => sum + item, 0)
        else if (operation === 'average') result = values.length === 0 ? 0 : values.reduce((sum, item) => sum + item, 0) / values.length
        else if (operation === 'min') result = values.length === 0 ? 0 : Math.min(...values)
        else if (operation === 'max') result = values.length === 0 ? 0 : Math.max(...values)
        else result = items.length
        return { $runflow: 'port-outputs', outputs: { result, items } }
      },
    },
    {
      type: 'builtin.json-parse',
      title: 'Parse JSON',
      description: 'Parse text into a JSON value.',
      category: 'data',
      group: 'Core/Data',
      color: '#38bdf8',
      icon: 'braces',
      inputs: [{ id: 'text', type: 'text' }],
      outputs: [jsonOutput],
      async execute({ input: value, inputs }) {
        const source = selectedInput(inputs, value)
        if (typeof source !== 'string') throw new Error('Parse JSON expects text input')
        return JSON.parse(source) as JsonValue
      },
    },
    {
      type: 'builtin.json-stringify',
      title: 'Stringify JSON',
      description: 'Serialize a JSON value as text.',
      category: 'data',
      group: 'Core/Data',
      color: '#38bdf8',
      icon: 'text',
      inputs: [jsonInput],
      outputs: [{ id: 'text', type: 'text' }],
      async execute({ input: value, node }) {
        return JSON.stringify(value, null, node.config['pretty'] === true ? 2 : 0)
      },
    },
    {
      type: 'builtin.wait',
      title: 'Wait',
      description: 'Pause the current execution branch for a bounded duration.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#a78bfa',
      icon: 'timer',
      inputs: [flowInput],
      outputs: [flowOutput],
      async execute({ input: value, node, signal }) {
        const configured = node.config['durationMs']
        const durationMs = typeof configured === 'number' && Number.isFinite(configured)
          ? Math.max(0, Math.min(3_600_000, Math.floor(configured)))
          : 1_000
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, durationMs)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(new Error('Wait cancelled'))
          }, { once: true })
        })
        return value
      },
    },
    {
      type: 'builtin.stop-error',
      title: 'Stop & Error',
      description: 'Stop this execution with an explicit error message.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#ef4444',
      icon: 'circle-stop',
      inputs: [flowInput],
      outputs: [],
      async execute({ node }) {
        const message = typeof node.config['message'] === 'string' && node.config['message'].trim().length > 0
          ? node.config['message'].trim()
          : 'Workflow stopped by Stop & Error'
        throw new Error(message)
      },
    },
    {
      type: 'builtin.noop',
      title: 'No Operation',
      description: 'Pass a typed flow signal through unchanged.',
      category: 'logic',
      group: 'Core/Flow',
      color: '#94a3b8',
      icon: 'route',
      inputs: [flowInput],
      outputs: [flowOutput],
      execute: passThrough,
    },
    {
      type: 'http.request',
      title: 'HTTP Request',
      description: 'Call a remote HTTP endpoint.',
      category: 'action',
      color: '#fb923c',
      icon: 'globe-2',
      inputs: [{ id: 'input', label: 'flow', type: 'flow' }, { id: 'body', type: 'json' }],
      outputs: [
        { id: 'body', label: 'json', type: 'json' },
        { id: 'text', label: 'text', type: 'text' },
        { id: 'status', label: 'status', type: 'number' },
        { id: 'headers', label: 'headers', type: 'json' },
      ],
      async execute({ input: value, inputs, node, signal, log, writeIntermediate }) {
        const url = node.config['url']
        if (typeof url !== 'string' || url.length === 0) throw new Error('HTTP Request requires config.url')
        const method = typeof node.config['method'] === 'string'
          ? node.config['method'].toUpperCase()
          : 'GET'
        const outboundHeaders = requestHeaders(node.config['headers'])
        const request: RequestInit = { method, headers: outboundHeaders, signal }
        if (method !== 'GET' && method !== 'HEAD') {
          const body = node.config['body'] ?? inputs['body'] ?? value
          if (typeof body === 'string') request.body = body
          else {
            request.body = JSON.stringify(body)
            const hasContentType = Object.keys(outboundHeaders).some(key => key.toLowerCase() === 'content-type')
            if (!hasContentType) outboundHeaders['content-type'] = 'application/json'
          }
        }
        log('Dispatching HTTP request', { method, url, hasBody: request.body !== undefined })
        const response = await fetch(url, request)
        const text = await response.text()
        await writeIntermediate('response-body', text, 'body')
        if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 500))
        let body: JsonValue | undefined
        let textOutput: string | undefined
        try {
          body = JSON.parse(text) as JsonValue
        } catch {
          textOutput = text
        }
        const headers: JsonObject = {}
        response.headers.forEach((value, key) => { headers[key] = value })
        return {
          $runflow: 'port-outputs',
          outputs: {
            ...(body === undefined ? {} : { body }),
            ...(textOutput === undefined ? {} : { text: textOutput }),
            status: response.status,
            headers,
          },
        }
      },
    },
    {
      type: 'dsh.agent',
      title: 'DSH Agent',
      description: 'Delegate to a native Harness Subagent with AgentOptions, structured output, tool scoping, and dynamic model routing.',
      category: 'ai',
      color: '#60a5fa',
      icon: 'bot',
      inputs: [{ id: 'input', label: 'json', type: 'json' }, { id: 'flow', type: 'flow' }, { id: 'text', type: 'text' }],
      outputs: [{
        id: 'result',
        label: 'result',
        type: 'json',
        description: 'Subagent lifecycle metadata, text/content output, and optional structured result.',
      }],
      configSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          subagentProvider: { type: 'string', description: 'Registered DSH Subagent provider. Omit to use the first live provider.' },
          label: { type: 'string', description: 'Optional child display label. Defaults to the workflow node name.' },
          agentOptions: {
            type: 'object',
            additionalProperties: false,
            properties: {
              provider: { type: 'string', description: 'Child LLM provider route.' },
              model: { type: 'string', description: 'Child model id interpreted by the selected LLM provider.' },
              reasoningEffort: { type: 'string', description: 'Adapter-owned reasoning effort for the exact child route.' },
              maxTokens: { type: 'integer', description: 'Positive per-request child output-token cap.' },
            },
          },
          outputSchema: { type: 'object', description: 'Object-rooted JSON Schema for structured child output.' },
          maxDepth: { type: 'integer', description: 'Non-negative absolute delegation-depth cap.' },
          toolFilter: {
            type: 'object',
            additionalProperties: false,
            properties: {
              allow: { type: 'array', items: { type: 'string' } },
              deny: { type: 'array', items: { type: 'string' } },
            },
          },
          persona: { type: 'string', description: 'Per-child persona using DSH system-prompt template semantics.' },
          prompt: { type: 'string', description: 'Child prompt. {{input}} is replaced with the workflow input JSON.' },
        },
      },
      available: true,
      execute: executeAgent,
    },
    {
      type: 'storage.write',
      title: 'Storage',
      description: 'Persist the incoming value as a durable per-run Host artifact.',
      category: 'data',
      color: '#2dd4bf',
      icon: 'database',
      inputs: [{ ...jsonInput, id: 'input', label: 'json' }],
      outputs: [{ id: 'output', label: 'receipt', type: 'json' }],
      async execute({ input: value, inputs, node, executionId, outputDir, writeIntermediate, log }) {
        const configured = node.config['collection']
        const collection = typeof configured === 'string' && configured.trim().length > 0
          ? configured.trim()
          : 'workflow-results'
        const storedValue = selectedInput(inputs, value)
        const artifact = await writeIntermediate('storage-' + collection, storedValue, 'output')
        const receipt: JsonObject = {
          stored: true,
          collection,
          documentId: executionId + '-' + node.id,
          path: artifact.path,
          value: storedValue,
        }
        log('Persisted workflow value', { collection, path: artifact.path, outputDir: outputDir ?? null })
        return receipt
      },
    },
  ]
}

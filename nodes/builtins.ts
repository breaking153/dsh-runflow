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

const input = { id: 'input', label: 'input', type: 'any' as const }
const output = { id: 'output', label: 'output', type: 'any' as const }
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
      outputs: [output],
      execute: passThrough,
    },
    {
      type: 'trigger.webhook',
      title: 'Webhook',
      description: 'Inbound listener is not installed; use Manual Trigger with Run Input.',
      category: 'trigger',
      color: '#22c55e',
      icon: 'webhook',
      inputs: [],
      outputs: [output],
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
      outputs: [output],
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
      outputs: [output],
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
      inputs: [input],
      outputs: [
        { id: 'value', label: 'value', type: 'any' },
        { id: 'matched', label: 'matched', type: 'boolean' },
      ],
      async execute({ input: value, node }) {
        const path = typeof node.config['path'] === 'string' ? node.config['path'] : ''
        const operator = typeof node.config['operator'] === 'string' ? node.config['operator'] : 'equals'
        return {
          $runflow: 'port-outputs',
          outputs: {
            value,
            matched: compare(readPath(value, path), operator, node.config['value']),
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
      inputs: [{ ...input, type: 'json' }],
      outputs: [{ ...output, type: 'json' }],
      async execute({ input: value, node }) {
        return { ...objectConfig(value), ...objectConfig(node.config['values']) }
      },
    },
    {
      type: 'http.request',
      title: 'HTTP Request',
      description: 'Call a remote HTTP endpoint.',
      category: 'action',
      color: '#fb923c',
      icon: 'globe-2',
      inputs: [input],
      outputs: [
        { id: 'body', label: 'body', type: 'any' },
        { id: 'status', label: 'status', type: 'number' },
        { id: 'headers', label: 'headers', type: 'json' },
      ],
      async execute({ input: value, node, signal, log, writeIntermediate }) {
        const url = node.config['url']
        if (typeof url !== 'string' || url.length === 0) throw new Error('HTTP Request requires config.url')
        const method = typeof node.config['method'] === 'string'
          ? node.config['method'].toUpperCase()
          : 'GET'
        const outboundHeaders = requestHeaders(node.config['headers'])
        const request: RequestInit = { method, headers: outboundHeaders, signal }
        if (method !== 'GET' && method !== 'HEAD') {
          const body = node.config['body'] ?? value
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
        let body: JsonValue
        try {
          body = JSON.parse(text) as JsonValue
        } catch {
          body = text
        }
        const headers: JsonObject = {}
        response.headers.forEach((value, key) => { headers[key] = value })
        return {
          $runflow: 'port-outputs',
          outputs: {
            body,
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
      inputs: [input],
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
      inputs: [input],
      outputs: [{ ...output, type: 'json' }],
      async execute({ input: value, node, executionId, outputDir, writeIntermediate, log }) {
        const configured = node.config['collection']
        const collection = typeof configured === 'string' && configured.trim().length > 0
          ? configured.trim()
          : 'workflow-results'
        const artifact = await writeIntermediate('storage-' + collection, value, 'output')
        const receipt: JsonObject = {
          stored: true,
          collection,
          documentId: executionId + '-' + node.id,
          path: artifact.path,
          value,
        }
        log('Persisted workflow value', { collection, path: artifact.path, outputDir: outputDir ?? null })
        return receipt
      },
    },
  ]
}

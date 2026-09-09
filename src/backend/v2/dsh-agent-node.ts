import type { Context } from '@deepseek-ai/cordis'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SubagentResult } from '@deepseek-ai/dsh-subagent'
import { assertObjectJsonSchema, type ObjectJsonSchema, type ToolRestriction } from '@deepseek-ai/dsh-tools'
import type { JsonObject, JsonValue, NodeExecutionContext } from '../../contracts.ts'

function json(value: unknown): JsonValue {
  const encoded = JSON.stringify(value)
  return encoded === undefined ? null : JSON.parse(encoded) as JsonValue
}

function configString(config: JsonObject, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function configRecord(config: JsonObject, key: string): JsonObject | undefined {
  const value = config[key]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('DSH Agent config.' + key + ' must be a JSON object')
  return value
}

function agentOption(config: JsonObject, key: string): JsonValue | undefined {
  const nested = configRecord(config, 'agentOptions')
  return nested !== undefined && Object.hasOwn(nested, key) ? nested[key] : config[key]
}

function optionalString(value: JsonValue | undefined, path: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(path + ' must be a non-empty string when configured')
  return value.trim()
}

function optionalInteger(value: JsonValue | undefined, path: string, minimum: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(path + ' must be a safe integer greater than or equal to ' + String(minimum))
  }
  return value
}

function optionalStringList(value: JsonValue | undefined, path: string): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const source = typeof value === 'string'
    ? value.split(/[\n,]/u).map(item => item.trim()).filter(Boolean)
    : value
  if (!Array.isArray(source)) throw new Error(path + ' must be an array of non-empty strings')
  const normalized = source.map(item => {
    if (typeof item !== 'string' || item.trim().length === 0) throw new Error(path + ' must be an array of non-empty strings')
    return item.trim()
  })
  const unique = [...new Set(normalized)]
  return unique.length === 0 ? undefined : unique
}

function outputSchema(config: JsonObject): ObjectJsonSchema | undefined {
  const value = config['outputSchema']
  if (value === undefined || value === null || value === '') return undefined
  assertObjectJsonSchema(value)
  return structuredClone(value)
}

function toolFilter(config: JsonObject): ToolRestriction | undefined {
  const record = configRecord(config, 'toolFilter')
  const allow = optionalStringList(record?.['allow'] ?? config['toolAllow'], 'DSH Agent config.toolFilter.allow')
  const deny = optionalStringList(record?.['deny'] ?? config['toolDeny'], 'DSH Agent config.toolFilter.deny')
  return allow === undefined && deny === undefined ? undefined : {
    ...(allow === undefined ? {} : { allow }),
    ...(deny === undefined ? {} : { deny }),
  }
}

function prompt(template: string | undefined, input: JsonValue): string {
  const renderedInput = JSON.stringify(input, null, 2)
  const base = template ?? 'Process the workflow input and return a concise result.'
  if (base.includes('{{input}}')) return base.replaceAll('{{input}}', renderedInput)
  return base + '\n\n<workflow_input>\n' + renderedInput + '\n</workflow_input>'
}

function assistantText(result: SubagentResult): string {
  return result.output
    .filter((block): block is Extract<(typeof result.output)[number], { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('\n')
}

/** Create the DSH-native Agent Node executor from live Cordis registries. */
export function createDshAgentNodeExecutor(ctx: Context): (execution: NodeExecutionContext) => Promise<JsonValue> {
  return async (execution): Promise<JsonValue> => {
    if (execution.agentId === undefined) throw new Error('DSH Agent nodes require ExecuteWorkflowOptions.agentId as delegation authority')
    const parent = ctx.agents.list().find(agent => String(agent.id) === execution.agentId)
    if (parent === undefined) throw new Error('live parent Agent not found: ' + execution.agentId)

    const availableProviders = ctx.subagents.list()
    const providerName = configString(execution.node.config, 'subagentProvider') ?? availableProviders[0]
    if (providerName === undefined) throw new Error('no DSH subagent provider is registered')
    const provider = ctx.subagents.getProvider(providerName)
    if (provider === undefined) throw new Error('unknown DSH subagent provider: ' + providerName)

    const modelProvider = optionalString(agentOption(execution.node.config, 'provider'), 'DSH Agent config.agentOptions.provider')
    const model = optionalString(agentOption(execution.node.config, 'model'), 'DSH Agent config.agentOptions.model')
    const reasoningEffort = optionalString(agentOption(execution.node.config, 'reasoningEffort'), 'DSH Agent config.agentOptions.reasoningEffort')
    const maxTokens = optionalInteger(agentOption(execution.node.config, 'maxTokens'), 'DSH Agent config.agentOptions.maxTokens', 1)
    const agentOptions: AgentOptions = {
      ...(modelProvider === undefined ? {} : { provider: modelProvider }),
      ...(model === undefined ? {} : { model }),
      ...(reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(reasoningEffort) }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    }
    const persona = configString(execution.node.config, 'persona')
    const maxDepth = optionalInteger(execution.node.config['maxDepth'], 'DSH Agent config.maxDepth', 0)
    const requestedOutputSchema = outputSchema(execution.node.config)
    const requestedToolFilter = toolFilter(execution.node.config)
    const label = configString(execution.node.config, 'label') ?? execution.node.name ?? execution.node.id

    if (Object.keys(agentOptions).length > 0 && !provider.capabilities.agentOptions) throw new Error('DSH subagent provider "' + providerName + '" does not support child agentOptions')
    if (requestedOutputSchema !== undefined && !provider.capabilities.outputSchema) throw new Error('DSH subagent provider "' + providerName + '" does not support outputSchema')
    if (maxDepth !== undefined && !provider.capabilities.depthLimit) throw new Error('DSH subagent provider "' + providerName + '" cannot enforce maxDepth')
    if (requestedToolFilter !== undefined && !provider.capabilities.toolFilter) throw new Error('DSH subagent provider "' + providerName + '" does not support toolFilter')
    if (persona !== undefined && !provider.capabilities.persona) throw new Error('DSH subagent provider "' + providerName + '" does not support persona')

    execution.log('Starting Harness subagent', {
      subagentProvider: providerName,
      modelProvider: agentOptions.provider ?? parent.options.provider ?? null,
      model: agentOptions.model ?? parent.options.model ?? null,
      reasoningEffort: agentOptions.reasoningEffort ?? parent.options.reasoningEffort ?? null,
      maxTokens: agentOptions.maxTokens ?? parent.options.maxTokens ?? null,
      maxDepth: maxDepth ?? null,
      structuredOutput: requestedOutputSchema !== undefined,
      toolFilter: requestedToolFilter === undefined ? null : {
        allow: requestedToolFilter.allow?.length ?? 0,
        deny: requestedToolFilter.deny?.length ?? 0,
      },
    })
    const run = await ctx.subagents.start(providerName, {
      label,
      prompt: [{ type: 'text', text: prompt(configString(execution.node.config, 'prompt'), execution.input) }],
      parent,
      signal: execution.signal,
      ...(Object.keys(agentOptions).length === 0 ? {} : { agentOptions }),
      ...(requestedOutputSchema === undefined ? {} : { outputSchema: requestedOutputSchema }),
      ...(persona === undefined ? {} : { persona }),
      ...(maxDepth === undefined ? {} : { maxDepth }),
      ...(requestedToolFilter === undefined ? {} : { toolFilter: requestedToolFilter }),
    })

    let result: SubagentResult
    try { result = await run.result } finally { await run.dispose() }
    if (result.stopReason !== 'completed') throw new Error(result.diagnostic ?? 'subagent ' + run.id + ' ended with ' + result.stopReason)
    const value = json({
      runId: String(run.id),
      sessionId: String(run.localAgent?.id ?? run.id),
      subagentProvider: providerName,
      inheritsParentContext: provider.inheritsParentContext,
      modelProvider: agentOptions.provider ?? parent.options.provider ?? null,
      model: agentOptions.model ?? parent.options.model ?? null,
      reasoningEffort: agentOptions.reasoningEffort ?? parent.options.reasoningEffort ?? null,
      maxTokens: agentOptions.maxTokens ?? parent.options.maxTokens ?? null,
      agentOptions: {
        provider: agentOptions.provider ?? parent.options.provider ?? null,
        model: agentOptions.model ?? parent.options.model ?? null,
        reasoningEffort: agentOptions.reasoningEffort ?? parent.options.reasoningEffort ?? null,
        maxTokens: agentOptions.maxTokens ?? parent.options.maxTokens ?? null,
      },
      request: {
        label,
        maxDepth: maxDepth ?? null,
        persona: persona !== undefined,
        outputSchema: requestedOutputSchema ?? null,
        toolFilter: requestedToolFilter ?? null,
      },
      providerCapabilities: provider.capabilities,
      stopReason: result.stopReason,
      text: assistantText(result),
      content: result.output,
      ...(result.structured === undefined ? {} : { structured: result.structured }),
    })
    await execution.writeIntermediate('subagent-result', value, 'result')
    execution.log('Harness subagent completed', { runId: String(run.id), stopReason: result.stopReason })
    return value
  }
}

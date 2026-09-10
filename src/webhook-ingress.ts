import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from './contracts.ts'
import type { FlowService } from './flow-service.ts'
import { runFlowSubject } from './flow-tool-access.ts'
import type { RunFlowWebhookBinding, RunFlowWebhookReceipt } from './remote-contract.ts'

interface HostWebServer {
  register(route: { kind: 'prefix'; path: string; handler(req: IncomingMessage, res: ServerResponse): Promise<void> }): () => void
}
interface LiveBinding {
  public: RunFlowWebhookBinding
  owner: Agent
  digest: Buffer
}

class IngressError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

const MAX_BODY_BYTES = 65_536
const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

function reply(res: ServerResponse, status: number, data: object): void {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}

async function readJson(req: IncomingMessage, signal: AbortSignal): Promise<JsonValue> {
  if (signal.aborted) throw new IngressError(503, 'RunFlow listener stopped')
  const length = req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new IngressError(413, 'Webhook input exceeds 64 KiB')
  }
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    let done = false
    const finish = (error?: Error): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onError)
      req.off('aborted', onAbort)
      signal.removeEventListener('abort', onStop)
      if (error !== undefined) { req.resume(); reject(error) }
      else resolve(Buffer.concat(chunks, received))
    }
    const onData = (chunk: Buffer): void => {
      received += chunk.length
      if (received > MAX_BODY_BYTES) finish(new IngressError(413, 'Webhook input exceeds 64 KiB'))
      else chunks.push(chunk)
    }
    const onEnd = (): void => finish()
    const onError = (): void => finish(new IngressError(400, 'Webhook input could not be read'))
    const onAbort = (): void => finish(new IngressError(400, 'Webhook request was aborted'))
    const onStop = (): void => finish(new IngressError(503, 'RunFlow listener stopped'))
    const timer = setTimeout(() => finish(new IngressError(408, 'Webhook input timed out')), 10_000)
    timer.unref()
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onError)
    req.on('aborted', onAbort)
    signal.addEventListener('abort', onStop, { once: true })
    if (signal.aborted) onStop()
  })
  try {
    return JSON.parse(bytes.toString('utf8'), (_key, value: unknown) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite JSON number')
      return value
    }) as JsonValue
  }
  catch { throw new IngressError(400, 'Webhook input must be valid JSON') }
}

/** Ephemeral bindings deliberately expire with the Host/plugin or the live Agent. */
export class RunFlowWebhooks {
  private readonly bindings = new Map<string, LiveBinding>()
  private listening = false
  private readonly prefix: string

  constructor(private readonly ctx: Context, private readonly flow: FlowService, apiPrefix = '/api/runflow') {
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(apiPrefix)) throw new Error('RunFlow apiPrefix must be an absolute URL path')
    this.prefix = apiPrefix.replace(/\/+$/, '') + '/webhooks/'
  }

  attach(ctx: Context): void {
    const server = ctx.get('webServer') as HostWebServer | undefined
    if (server === undefined) return
    ctx.effect(() => {
      const cancellation = new AbortController()
      const handlers = new Set<Promise<void>>()
      const unregister = server.register({ kind: 'prefix', path: this.prefix.slice(0, -1), handler: (req, res) => {
        const task = this.handle(req, res, cancellation.signal)
        handlers.add(task)
        void task.then(() => handlers.delete(task), () => handlers.delete(task))
        return task
      } })
      this.listening = true
      this.flow.setWebhookAvailable(true)
      return async () => {
        this.listening = false
        this.flow.setWebhookAvailable(false)
        unregister()
        cancellation.abort('RunFlow listener stopped')
        for (const binding of this.bindings.values()) binding.digest.fill(0)
        this.bindings.clear()
        await Promise.allSettled([...handlers])
      }
    }, 'dsh-runflow: authenticated webhook ingress')
  }

  private live(owner: Agent): boolean {
    return this.ctx.get('agents')?.list().some(candidate => runFlowSubject(candidate) === runFlowSubject(owner)) ?? false
  }

  private requireOwner(agent: Agent): void {
    if (!this.listening || !this.flow.isAvailable()) throw new Error('RunFlow webhook listener is unavailable')
    if (!this.live(agent)) throw new Error('Webhook binding requires a live DSH Agent')
  }

  get(agent: Agent, workflowId: string): RunFlowWebhookBinding | null {
    if (!this.listening || !this.flow.isAvailable() || !this.live(agent)) return null
    const binding = [...this.bindings.values()].find(item => item.public.workflowId === workflowId
      && runFlowSubject(item.owner) === runFlowSubject(agent))
    return binding === undefined ? null : structuredClone(binding.public)
  }

  enable(agent: Agent, workflowId: string, triggerNodeId: string): RunFlowWebhookReceipt {
    this.requireOwner(agent)
    const workflow = this.flow.workflow(workflowId)
    if (!workflow?.nodes.some(node => node.id === triggerNodeId && node.type === 'trigger.webhook' && !node.disabled)) {
      throw new Error('Workflow has no enabled webhook entry with that node ID')
    }
    this.disable(agent, workflowId)
    const id = randomUUID()
    const token = randomBytes(32).toString('base64url')
    const binding: RunFlowWebhookBinding = { id, workflowId, triggerNodeId, path: this.prefix + id, createdAt: new Date().toISOString() }
    this.bindings.set(id, { public: binding, owner: runFlowSubject(agent), digest: digest(token) })
    return { binding: structuredClone(binding), token }
  }

  disable(agent: Agent, workflowId: string): boolean {
    const binding = [...this.bindings.values()].find(item => item.public.workflowId === workflowId
      && runFlowSubject(item.owner) === runFlowSubject(agent))
    if (binding === undefined) return false
    binding.digest.fill(0)
    return this.bindings.delete(binding.public.id)
  }

  private async handle(req: IncomingMessage, res: ServerResponse, signal: AbortSignal): Promise<void> {
    try {
      const path = (req.url ?? '').split('?')[0]!
      const id = path.startsWith(this.prefix) ? path.slice(this.prefix.length) : ''
      const binding = this.bindings.get(id)
      if (binding === undefined) throw new IngressError(404, 'Webhook binding not found')
      if (!this.listening || !this.flow.isAvailable()) throw new IngressError(503, 'RunFlow is unavailable')
      if (req.method !== 'POST') { res.setHeader('allow', 'POST'); throw new IngressError(405, 'Use POST') }
      const authorization = req.headers.authorization ?? ''
      if (!authorization.startsWith('Bearer ') || authorization.length > 512
        || !timingSafeEqual(binding.digest, digest(authorization.slice(7)))) {
        throw new IngressError(401, 'Webhook authentication failed')
      }
      if (!this.live(binding.owner)) throw new IngressError(410, 'Webhook owner is no longer active; enable a new binding')
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
        throw new IngressError(415, 'Use application/json')
      }
      const input = await readJson(req, signal)
      // Admission is checked again after reading; revocation/unload may happen
      // while a slow sender is still streaming the payload.
      if (this.bindings.get(id) !== binding || !this.listening || !this.flow.isAvailable() || !this.live(binding.owner)) {
        throw new IngressError(410, 'Webhook binding is no longer active')
      }
      const workflow = this.flow.workflow(binding.public.workflowId)
      if (!workflow?.nodes.some(node => node.id === binding.public.triggerNodeId && node.type === 'trigger.webhook' && !node.disabled)) {
        throw new IngressError(410, 'Webhook entry is no longer available')
      }
      if (this.flow.activeExecutionCount() >= 32) {
        throw new IngressError(429, 'RunFlow is busy; try again later')
      }
      const execution = this.flow.start(binding.public.workflowId, {
        trigger: 'webhook', agentId: String(binding.owner.id), entryNodeIds: [binding.public.triggerNodeId], input,
      })
      reply(res, 202, { executionId: execution.id })
    } catch (error) {
      req.resume()
      // Never echo payloads, authorization headers or filesystem errors here.
      reply(res, error instanceof IngressError ? error.status : 422,
        { error: error instanceof IngressError ? error.message : 'Workflow could not be started' })
    }
  }
}

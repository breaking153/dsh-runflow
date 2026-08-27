import { describe, expect, it, vi } from 'vitest'
import { FlowScriptChannel } from '../script/channel.ts'
import type { FlowScriptExecutionResult, FlowScriptRequest } from '../script/contracts.ts'

function request(requestId = 'request-1'): FlowScriptRequest {
  return {
    requestId,
    executionId: 'execution-1',
    nodeId: 'script-1',
    agentId: 'agent-1',
    description: 'test script',
    program: 'return input',
    input: { ok: true },
    signal: new AbortController().signal,
  }
}

function success(requestId = 'request-1'): FlowScriptExecutionResult {
  return {
    requestId,
    executionId: 'execution-1',
    nodeId: 'script-1',
    status: 'success',
    value: { ok: true },
    logs: ['done'],
    timing: {
      queuedAt: '2026-08-27T00:00:00.000Z',
      startedAt: '2026-08-27T00:00:00.010Z',
      finishedAt: '2026-08-27T00:00:00.020Z',
      durationMs: 10,
    },
    runtime: { transport: 'run_code', language: 'typescript', agentId: 'agent-1' },
  }
}

describe('FlowScriptChannel', () => {
  it('correlates multiple waiters with one immutable terminal result', async () => {
    const channel = new FlowScriptChannel()
    const listener = vi.fn()
    channel.subscribe(listener)
    const ticket = channel.enqueue(request())
    channel.running(ticket.requestId)
    const first = channel.wait(ticket.requestId)
    const second = channel.wait(ticket.requestId)
    channel.settle(success(ticket.requestId))

    await expect(first).resolves.toEqual(expect.objectContaining({ status: 'success', value: { ok: true } }))
    await expect(second).resolves.toEqual(expect.objectContaining({ requestId: ticket.requestId }))
    expect(channel.snapshot(ticket.requestId)?.status).toBe('success')
    expect(listener.mock.calls.map(call => call[0].status)).toEqual(['queued', 'running', 'success'])
  })

  it('aborts one waiter without cancelling the underlying run', async () => {
    const channel = new FlowScriptChannel()
    const ticket = channel.enqueue(request('request-2'))
    channel.running(ticket.requestId)
    const controller = new AbortController()
    const waiting = channel.wait(ticket.requestId, controller.signal)
    controller.abort(new Error('viewer left'))
    await expect(waiting).rejects.toThrow('viewer left')

    channel.settle(success(ticket.requestId))
    await expect(ticket.result).resolves.toEqual(expect.objectContaining({ status: 'success' }))
  })
})
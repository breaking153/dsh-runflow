import { execFile } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('demo HTTP server', () => {
  it.each([
    { name: 'malformed request target', target: 'http://[', body: '', repeat: 1, status: 400 },
    { name: 'malformed JSON', target: '/echo', body: '{"unfinished":', repeat: 1, status: 400 },
    { name: 'body larger than 64 KiB', target: '/echo', body: 'x', repeat: 65537, status: 413 },
  ])('rejects $name with HTTP $status and remains available', async ({ target, body, repeat, status }) => {
    // Isolate an unhandled async request rejection from the Vitest process.
    const fixture = new URL('../examples/demo-http-server.mjs', import.meta.url).href
    const script = `
      import assert from 'node:assert/strict'
      import { once } from 'node:events'
      import net from 'node:net'
      import { startDemoServer } from ${JSON.stringify(fixture)}

      const server = startDemoServer(0)
      await once(server, 'listening')
      const port = server.address().port
      try {
        const body = ${JSON.stringify(body)}.repeat(${repeat})
        const response = await new Promise((resolve, reject) => {
          const socket = net.connect(port, '127.0.0.1', () => {
            socket.write('POST ' + ${JSON.stringify(target)} + ' HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\nContent-Length: '
              + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body)
          })
          let text = ''
          socket.setEncoding('utf8')
          socket.on('data', chunk => { text += chunk })
          socket.on('end', () => resolve(text))
          socket.on('error', reject)
        })
        assert.ok(response.startsWith('HTTP/1.1 ${status} '), response)
        const health = await fetch('http://127.0.0.1:' + port + '/health')
        assert.equal(health.status, 200)
        assert.equal((await health.json()).ok, true)
      } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
      }
    `
    const result = await new Promise<{ error: Error | null; stderr: string }>(resolve => {
      execFile(process.execPath, ['--unhandled-rejections=strict', '--input-type=module', '--eval', script],
        { timeout: 5000 }, (error, _stdout, stderr) => resolve({ error, stderr }))
    })
    expect(result.error, result.stderr).toBeNull()
  }, 10000)
})

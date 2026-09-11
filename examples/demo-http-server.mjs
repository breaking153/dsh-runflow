import http from 'node:http'
import { pathToFileURL } from 'node:url'

/** A loopback-only endpoint for the shipped HTTP workflow demo. */
export function startDemoServer(port = 18947) {
  const server = http.createServer(async (request, response) => {
    const send = (status, value) => {
      response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(value))
    }
    let pathname
    try {
      pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    } catch {
      return send(400, { ok: false, error: 'Invalid request URL' })
    }
    if (pathname === '/health') return send(200, { ok: true, service: 'RunFlow demo' })
    if (pathname === '/fail') return send(503, { ok: false, error: 'Demo failure' })
    if (pathname !== '/echo') return send(404, { ok: false, error: 'Use /echo, /fail or /health' })
    try {
      const chunks = []
      let bytes = 0
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 65536) return send(413, { ok: false, error: 'Demo input exceeds 64 KiB' })
        chunks.push(chunk)
      }
      const text = Buffer.concat(chunks).toString('utf8')
      const body = text.length === 0 ? null : JSON.parse(text)
      send(200, { ok: true, method: request.method, path: pathname, body })
    } catch {
      send(400, { ok: false, error: 'Expected a JSON request body' })
    }
  })
  server.on('error', error => { console.error('RunFlow demo server:', error.message); process.exitCode = 1 })
  server.listen(port, '127.0.0.1', () => console.log(`RunFlow demo: http://127.0.0.1:${port}/echo (Ctrl+C to stop)`))
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.RUNFLOW_DEMO_PORT ?? 18947)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RUNFLOW_DEMO_PORT must be an integer from 1 to 65535')
  startDemoServer(port)
}

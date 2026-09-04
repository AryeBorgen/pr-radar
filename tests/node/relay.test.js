import { createServer } from 'node:http'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleAuth, originsFor } from '../../bin/relay.js'

/**
 * The relay, attacked.
 *
 * Every restriction in bin/relay.js is here as an attempt to get past it. A
 * restriction nobody has tried to break is a comment, and this file is a
 * process on a developer's machine that talks to github.com -- the one place in
 * this project where getting that wrong costs something real.
 *
 * GitHub is replaced by a local server that records exactly what arrived, so
 * "no request header is forwarded" is checked by looking at what GitHub would
 * have seen rather than by reading the code that builds it.
 */

let upstream
let upstreamUrl
/** Everything github.com received, in order. */
let received = []
/** What the fake GitHub answers next. */
let reply = { status: 200, body: { device_code: 'd', user_code: 'U-C', verification_uri: 'https://github.com/login/device' } }

before(async () => {
  upstream = createServer((request, response) => {
    let body = ''
    request.on('data', (c) => (body += c))
    request.on('end', () => {
      received.push({ url: request.url, headers: request.headers, body })
      response.writeHead(reply.status, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(reply.body))
    })
  })
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r))
  upstreamUrl = `http://127.0.0.1:${upstream.address().port}`
})

after(() => upstream.close())

const ORIGINS = originsFor('127.0.0.1', 4173)

/** Drive handleAuth over a real socket, so headers and bodies are real. */
async function call(path, { method = 'POST', headers = {}, body, clientId = 'Iv1.abc' } = {}) {
  received = []
  const server = createServer((request, response) => {
    handleAuth(request, response, { clientId, origins: ORIGINS }).then((handled) => {
      if (!handled) { response.writeHead(200); response.end('fell through to files') }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    const text = await response.text()
    let parsed
    try { parsed = JSON.parse(text) } catch { parsed = text }
    return { status: response.status, body: parsed, headers: response.headers }
  } finally {
    server.close()
  }
}

describe('what it will not do', () => {
  it('serves no route but the three it declares', async () => {
    const r = await call('/auth/anything-else')
    assert.equal(r.status, 404)
  })

  // The reason /auth/ is intercepted before the file handler: falling through
  // would answer a fetch with index.html, and the page would report a JSON
  // parse error rather than a missing route.
  it('never falls through to the static files', async () => {
    const r = await call('/auth/device/code', { method: 'GET' })
    assert.notEqual(r.body, 'fell through to files')
  })

  it('refuses GET on the device routes', async () => {
    const r = await call('/auth/device/code', { method: 'GET' })
    assert.equal(r.status, 405)
    assert.equal(r.headers.get('allow'), 'POST')
  })

  it('refuses POST on the config route', async () => {
    const r = await call('/auth/config', { body: {} })
    assert.equal(r.status, 405)
  })

  // Requiring JSON is what forces a cross-origin caller to preflight. A
  // form-encoded POST is a "simple request" and would skip it entirely.
  it('refuses a form-encoded body, which is the one that needs no preflight', async () => {
    const r = await call('/auth/device/code', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'client_id=x',
    })
    assert.equal(r.status, 415)
  })

  it('refuses a request from another origin', async () => {
    const r = await call('/auth/device/code', {
      headers: { Origin: 'https://evil.example' },
      body: {},
    })
    assert.equal(r.status, 403)
  })

  it('accepts one from the page it is serving', async () => {
    const r = await call('/auth/config', {
      method: 'GET',
      headers: { Origin: 'http://127.0.0.1:4173' },
    })
    assert.equal(r.status, 200)
  })

  it('refuses a body larger than the protocol needs, and says so', async () => {
    // 413 rather than a dropped connection. Destroying the socket on an
    // oversized body means the client sees a network error and cannot tell a
    // refusal from a crash.
    const r = await call('/auth/device/code', { body: { scope: 'x'.repeat(8000) } })
    assert.equal(r.status, 413)
    assert.equal(r.body.error, 'payload_too_large')
  })

  it('refuses a body that is not JSON', async () => {
    const r = await call('/auth/device/code', { body: 'not json at all' })
    assert.equal(r.status, 400)
    assert.equal(r.body.error, 'bad_request')
  })

  it('sends no CORS header, so a cross-origin preflight can never succeed', async () => {
    const r = await call('/auth/config', { method: 'GET' })
    assert.equal(r.headers.get('access-control-allow-origin'), null)
  })

  it('tells caches not to keep a response that may carry a token', async () => {
    const r = await call('/auth/config', { method: 'GET' })
    assert.equal(r.headers.get('cache-control'), 'no-store')
  })
})

describe('what it will not forward', () => {
  it('refuses a device_code that is not shaped like one', async () => {
    const r = await call('/auth/device/token', { body: { device_code: '../../etc/passwd' } })
    assert.equal(r.status, 400)
    assert.equal(received.length, 0, 'nothing should have reached GitHub')
  })

  it('refuses a scope carrying a newline, which is how a header gets injected', async () => {
    const r = await call('/auth/device/code', { body: { scope: 'repo\r\nX-Evil: 1' } })
    assert.equal(r.status, 400)
    assert.equal(received.length, 0)
  })

  it('refuses a grant_type other than the device flow', async () => {
    const r = await call('/auth/device/token', { body: { grant_type: 'client_credentials' } })
    assert.equal(r.status, 400)
  })

  it('refuses a non-string where a string belongs', async () => {
    const r = await call('/auth/device/code', { body: { scope: { toString: 'nope' } } })
    assert.equal(r.status, 400)
  })
})

describe('what it forwards', () => {
  // Driven against the fake GitHub by pointing the module's constants at it,
  // which is the only way to see what would actually have been sent.
  const drive = async (path, body, headers = {}) => {
    const { __testing } = await import('../../bin/relay.js')
    const original = globalThis.fetch
    let sent
    // Only GitHub is intercepted. The previous version replaced fetch outright
    // and captured this test's own request to the relay, which is why it
    // reported the relay forwarding an attacker's client id -- the assertion
    // was reading the wrong request entirely.
    globalThis.fetch = async (url, init) =>
      String(url).startsWith('https://github.com/')
        ? ((sent = { url: String(url), init }), original(`${upstreamUrl}/probe`, init))
        : original(url, init)
    try {
      const r = await call(path, { body, headers })
      return { ...r, sent }
    } finally {
      globalThis.fetch = original
      void __testing
    }
  }

  it('sends the client id from its own configuration, never from the request', async () => {
    const r = await drive('/auth/device/code', { client_id: 'Iv1.ATTACKER', scope: 'repo' })
    assert.equal(r.status, 200)
    assert.equal(JSON.parse(received[0].body).client_id, 'Iv1.abc')
  })

  it('forwards no header from the incoming request', async () => {
    await drive('/auth/device/code', { scope: 'repo' }, {
      Authorization: 'Bearer stolen',
      Cookie: 'session=stolen',
      'X-Forwarded-For': '10.0.0.1',
    })
    const headers = received[0].headers
    assert.equal(headers.authorization, undefined)
    assert.equal(headers.cookie, undefined)
    assert.equal(headers['x-forwarded-for'], undefined)
  })

  it('names github.com as a constant, with nothing from the request in the URL', async () => {
    const r = await drive('/auth/device/code', { scope: 'repo' })
    assert.equal(r.sent.url, 'https://github.com/login/device/code')
  })

  it('uses the token endpoint for the token route', async () => {
    const r = await drive('/auth/device/token', { device_code: 'abc123' })
    assert.equal(r.sent.url, 'https://github.com/login/oauth/access_token')
  })

  it('drops fields GitHub did not need to see', async () => {
    await drive('/auth/device/code', { scope: 'repo', redirect_uri: 'https://evil.example' })
    assert.equal(JSON.parse(received[0].body).redirect_uri, undefined)
  })
})

describe('what it returns', () => {
  const drive = async (path, body, upstreamReply) => {
    reply = upstreamReply
    const original = globalThis.fetch
    globalThis.fetch = async (url, init) =>
      String(url).startsWith('https://github.com/')
        ? original(`${upstreamUrl}/probe`, init)
        : original(url, init)
    try {
      return await call(path, { body })
    } finally {
      globalThis.fetch = original
    }
  }

  it('rebuilds the reply from the fields the flow needs', async () => {
    const r = await drive('/auth/device/code', {}, {
      status: 200,
      body: { device_code: 'd', user_code: 'U', verification_uri: 'https://x', set_cookie: 'no', internal_debug: 'leak' },
    })
    assert.deepEqual(Object.keys(r.body).sort(), ['device_code', 'user_code', 'verification_uri'])
  })

  // GitHub answers a pending poll with 200 and an `error` field, so `error` has
  // to survive the rebuild or every pending poll reads as an empty success.
  it('keeps the error field, which is how a pending poll is expressed', async () => {
    const r = await drive('/auth/device/token', { device_code: 'abc' }, {
      status: 200,
      body: { error: 'authorization_pending' },
    })
    assert.equal(r.body.error, 'authorization_pending')
  })

  it('keeps a refresh token and expiry when a GitHub App sends them', async () => {
    const r = await drive('/auth/device/token', { device_code: 'abc' }, {
      status: 200,
      body: { access_token: 'gho_x', refresh_token: 'ghr_y', expires_in: 28800 },
    })
    assert.deepEqual(r.body, { access_token: 'gho_x', refresh_token: 'ghr_y', expires_in: 28800 })
  })
})

describe('with no GitHub App configured', () => {
  it('says so on the config route, rather than offering a button that cannot work', async () => {
    const r = await call('/auth/config', { method: 'GET', clientId: '' })
    assert.equal(r.status, 404)
    assert.equal(r.body.error, 'device_flow_unavailable')
  })

  it('refuses the device routes too, without contacting GitHub', async () => {
    const r = await call('/auth/device/code', { body: {}, clientId: '' })
    assert.equal(r.status, 404)
    assert.equal(received.length, 0)
  })
})

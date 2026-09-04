/**
 * The two routes that make signing in possible, and nothing else.
 *
 * GitHub's OAuth endpoints send no `Access-Control-Allow-Origin`, so a page
 * cannot read their replies -- measured, not assumed; see
 * tests/reachability.spec.ts, which asks GitHub directly on every run. A login
 * therefore needs something server-side to relay, and `npx pr-radar` already is
 * something server-side, running on the user's own machine.
 *
 * That placement is the entire security argument, so it is worth stating
 * plainly: the device flow needs no client secret, so this holds none. It keeps
 * no session and writes nothing. The access token passes through on its way to
 * the browser, which is where the pasted token lives today.
 *
 * What it must not become is an open proxy. A process on a developer's laptop
 * that will forward a request anywhere is a hole, and it would be one opened in
 * the name of convenience. So:
 *
 *   - two routes, and the upstream of each is a constant in this file;
 *   - nothing in a request names a host, a path or a scheme;
 *   - four body fields are forwarded, each matched against a pattern;
 *   - no request header is passed on -- not Authorization, not Cookie;
 *   - the reply is rebuilt from the fields the flow needs;
 *   - JSON only, which forces a preflight that is never answered, and an
 *     explicit Origin check behind it.
 *
 * tests/node/relay.test.js asserts each of those by attempting the abuse.
 *
 * The rules themselves live in relay-policy.js, which nginx runs too. This file
 * is only the Node plumbing around them: reading a body, calling fetch, writing
 * a response.
 */
import policy from './relay-policy.js'

function json(response, status, body, headers = {}) {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    // A token must never be stored by anything between here and the page.
    'Cache-Control': 'no-store',
    ...headers,
  })
  response.end(text)
}

/**
 * Read a JSON body, refusing one that is too large.
 *
 * Size is checked as it arrives, so an oversized body is dropped mid-flight
 * rather than buffered first. The socket is not destroyed: the caller still has
 * to answer 413, and a destroyed request means the client sees a network error
 * instead of being told what was wrong.
 */
function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    let done = false
    const chunks = []
    request.on('data', (chunk) => {
      if (done) return
      size += chunk.length
      if (size > policy.MAX_BODY_BYTES) {
        done = true
        request.pause()
        reject(Object.assign(new Error('body too large'), { tooLarge: true }))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('body is not JSON'))
      }
    })
    request.on('error', reject)
  })
}

async function forward(url, fields) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), policy.UPSTREAM_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      // Built here from the allowlist. Nothing from the incoming request's
      // headers is copied: not Authorization, not Cookie, not Origin.
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(fields),
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({}))
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Handle an auth route, or return false so the caller serves a file.
 *
 * `clientId` being absent is not an error: it is a deployment with no GitHub
 * App configured, and the config route says so with a 404 rather than offering
 * a button that cannot work.
 */
export async function handleAuth(request, response, { clientId, origins }) {
  const path = new URL(request.url, 'http://localhost').pathname
  if (!path.startsWith('/auth/')) return false

  if (!policy.originAllowed(request.headers.origin, origins)) {
    json(response, 403, { error: 'forbidden' })
    return true
  }

  if (path === '/auth/config') {
    if (request.method !== 'GET') {
      json(response, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    } else if (!clientId) {
      json(response, 404, { error: 'device_flow_unavailable' })
    } else {
      json(response, 200, { deviceFlow: true, clientId })
    }
    return true
  }

  // The upstream, overridable only by the environment -- never by a request.
  // It exists so the conformance suite can point both servers at a fake GitHub
  // and compare their answers; the suite then proves a request cannot influence
  // it, which is the property that actually matters.
  const base = process.env.PR_RADAR_UPSTREAM ?? ''
  const real = policy.upstreamFor(path)
  const upstream = real === null || base === '' ? real : base + real.replace('https://github.com', '')
  if (upstream === null) {
    json(response, 404, { error: 'not_found' })
    return true
  }

  if (request.method !== 'POST') {
    json(response, 405, { error: 'method_not_allowed' }, { Allow: 'POST' })
    return true
  }
  // Requiring JSON is what forces a cross-origin caller to preflight.
  if (!String(request.headers['content-type'] ?? '').includes('application/json')) {
    json(response, 415, { error: 'unsupported_media_type' })
    return true
  }
  if (!clientId) {
    json(response, 404, { error: 'device_flow_unavailable' })
    return true
  }

  let body
  try {
    body = await readBody(request)
  } catch (error) {
    if (error.tooLarge) {
      response.on('finish', () => request.destroy())
      json(response, 413, { error: 'payload_too_large' })
    } else {
      json(response, 400, { error: 'bad_request', detail: error.message })
    }
    return true
  }

  const built = policy.buildUpstreamBody(body, clientId)
  if (built.error !== undefined) {
    json(response, 400, { error: 'bad_request', detail: built.error })
    return true
  }

  try {
    const result = await forward(upstream, built.fields)
    json(response, result.status, policy.only(result.body, policy.shapeFor(path)))
  } catch (error) {
    // Never surface the upstream error verbatim: it can carry a URL, and a URL
    // in an error message is how internal shape leaks.
    json(response, 502, {
      error: error.name === 'AbortError' ? 'upstream_timeout' : 'upstream_failed',
    })
  }
  return true
}

export const originsFor = policy.originsFor
export const __testing = { policy }

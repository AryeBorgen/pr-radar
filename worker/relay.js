import policy from '../bin/relay-policy.js'

/**
 * The sign-in relay, for a deployment that has no server of its own.
 *
 * `npx pr-radar` and the container relay from the user's own machine, and that
 * placement is most of the security argument. The hosted page on GitHub Pages
 * has no machine to relay from, so it needs somewhere -- and this is the
 * smallest somewhere there is: a stateless function that forwards two requests
 * and holds nothing.
 *
 * Same policy file as both other servers. What is genuinely different is stated
 * below rather than hidden, because it is the one place this relay is weaker
 * than the local ones.
 */

/**
 * **This one sends CORS headers, and the local relays deliberately do not.**
 *
 * The local relay is same-origin, so refusing every cross-origin request costs
 * nothing and closes a real hole: a page anywhere could otherwise POST to a
 * developer's `localhost:4173`. This relay is by definition cross-origin -- the
 * page is on github.io and the worker is not -- so it has to answer preflights.
 *
 * The mitigation is that it answers them for an allowlist and never for `*`.
 * `PR_RADAR_ORIGINS` is a comma-separated list set on the worker; an origin
 * that is not on it gets no CORS header and no reply, exactly as the local
 * relay treats one.
 */
function allowedOrigins(env) {
  return new Set(
    String(env.PR_RADAR_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    // Caches must key on Origin, or one allowed origin's response can be served
    // to another that was never allowed.
    Vary: 'Origin',
  }
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // A token must never be stored by anything between here and the page.
      'Cache-Control': 'no-store',
      ...(origin ? corsHeaders(origin) : { Vary: 'Origin' }),
    },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin')
    const allowed = allowedOrigins(env)

    // No Origin at all is a non-browser caller -- curl, a health check. Those
    // cannot be driven by a hostile page, which is the threat being closed.
    const permitted = origin === null ? null : allowed.has(origin) ? origin : false
    if (permitted === false) return json({ error: 'forbidden' }, 403, undefined)

    if (request.method === 'OPTIONS') {
      // A preflight is answered only for an origin on the list. Everything else
      // has already been refused above.
      return new Response(null, {
        status: 204,
        headers: permitted ? corsHeaders(permitted) : { Vary: 'Origin' },
      })
    }

    const clientId = String(env.PR_RADAR_CLIENT_ID ?? '')

    if (path === '/auth/config') {
      if (request.method !== 'GET') {
        return json({ error: 'method_not_allowed' }, 405, permitted ?? undefined)
      }
      if (!clientId) return json({ error: 'device_flow_unavailable' }, 404, permitted ?? undefined)
      return json({ deviceFlow: true, clientId }, 200, permitted ?? undefined)
    }

    const upstream = policy.upstreamFor(path)
    if (upstream === null) return json({ error: 'not_found' }, 404, permitted ?? undefined)
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, permitted ?? undefined)
    }
    if (!(request.headers.get('Content-Type') ?? '').includes('application/json')) {
      return json({ error: 'unsupported_media_type' }, 415, permitted ?? undefined)
    }
    if (!clientId) return json({ error: 'device_flow_unavailable' }, 404, permitted ?? undefined)

    const raw = await request.text()
    if (raw.length > policy.MAX_BODY_BYTES) {
      return json({ error: 'payload_too_large' }, 413, permitted ?? undefined)
    }

    let body
    try {
      body = JSON.parse(raw || '{}')
    } catch {
      return json({ error: 'bad_request', detail: 'body is not JSON' }, 400, permitted ?? undefined)
    }

    const built = policy.buildUpstreamBody(body, clientId)
    if (built.error !== undefined) {
      return json({ error: 'bad_request', detail: built.error }, 400, permitted ?? undefined)
    }

    try {
      const reply = await fetch(env.PR_RADAR_UPSTREAM ? env.PR_RADAR_UPSTREAM + path : upstream, {
        method: 'POST',
        // Built from the allowlist. Nothing from the incoming request's headers
        // is copied: not Authorization, not Cookie, not Origin.
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(built.fields),
      })
      const parsed = await reply.json().catch(() => ({}))
      return json(policy.only(parsed, policy.shapeFor(path)), reply.status, permitted ?? undefined)
    } catch {
      // Never the upstream error verbatim: it can carry a URL, and a URL in an
      // error message is how internal shape leaks.
      return json({ error: 'upstream_failed' }, 502, permitted ?? undefined)
    }
  },
}

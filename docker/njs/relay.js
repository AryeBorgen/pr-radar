/**
 * The auth relay, as nginx runs it.
 *
 * The rules are not here. They are in relay-policy.js, the same file
 * `bin/pr-radar.js` imports, so the container and `npx pr-radar` cannot come to
 * disagree about what is allowed -- which is exactly the kind of difference
 * that would go unnoticed until it mattered. This file is the nginx plumbing:
 * reading a request, calling out, writing a reply.
 *
 * tests/node/conformance.test.js drives both servers over HTTP and requires the
 * same answers from each.
 */

import policy from 'relay-policy.js'

/**
 * The client id, and the origins this server answers for.
 *
 * Read from the environment at request time rather than baked in, so one image
 * serves any deployment. `PR_RADAR_CLIENT_ID` absent means no GitHub App is
 * configured, and the config route says so -- the same answer the CLI gives.
 */
function clientId() {
  return process.env.PR_RADAR_CLIENT_ID || ''
}

/**
 * The upstream host, overridable only by the environment.
 *
 * It exists so the conformance suite can point the container at a fake GitHub;
 * `docker/smoke.sh` proves a *request* cannot influence it, which is the
 * property that matters. Unset, it is github.com.
 */
function upstreamFor(path) {
  var base = process.env.PR_RADAR_UPSTREAM || ''
  var real = policy.upstreamFor(path)
  if (real === null) return null
  return base === '' ? real : base + real.replace('https://github.com', '')
}

function send(r, status, body, extra) {
  r.headersOut['Content-Type'] = 'application/json; charset=utf-8'
  // A token must never be stored by anything between here and the page.
  r.headersOut['Cache-Control'] = 'no-store'
  if (extra) for (var key in extra) r.headersOut[key] = extra[key]
  r.return(status, JSON.stringify(body))
}

function config(r) {
  if (!policy.originAllowed(r.headersIn['Origin'], origins(r))) {
    send(r, 403, { error: 'forbidden' })
    return
  }
  if (r.method !== 'GET') {
    send(r, 405, { error: 'method_not_allowed' }, { Allow: 'GET' })
    return
  }
  var id = clientId()
  if (id === '') {
    send(r, 404, { error: 'device_flow_unavailable' })
    return
  }
  send(r, 200, { deviceFlow: true, clientId: id })
}

/** The origins a page served by this container could carry. */
function origins(r) {
  // The container publishes port 80 inside; the browser's Origin carries the
  // *published* port, which this process cannot know. `Host` is what the
  // browser sent, and an Origin that matches it is same-origin by definition.
  var host = r.headersIn['Host'] || 'localhost'
  var out = {}
  out['http://' + host] = true
  out['https://' + host] = true
  return out
}

function device(r) {
  if (!policy.originAllowed(r.headersIn['Origin'], origins(r))) {
    send(r, 403, { error: 'forbidden' })
    return
  }

  var path = r.uri
  var upstream = upstreamFor(path)
  if (upstream === null) {
    send(r, 404, { error: 'not_found' })
    return
  }
  if (r.method !== 'POST') {
    send(r, 405, { error: 'method_not_allowed' }, { Allow: 'POST' })
    return
  }
  // Requiring JSON is what forces a cross-origin caller to preflight.
  var type = r.headersIn['Content-Type'] || ''
  if (type.indexOf('application/json') === -1) {
    send(r, 415, { error: 'unsupported_media_type' })
    return
  }
  var id = clientId()
  if (id === '') {
    send(r, 404, { error: 'device_flow_unavailable' })
    return
  }

  var raw = r.requestText || '{}'
  // nginx caps the body itself (client_max_body_size), but that answers 413 as
  // HTML from its own error page. Checking here keeps the answer JSON, so a
  // fetch never has to guess what came back.
  if (raw.length > policy.MAX_BODY_BYTES) {
    send(r, 413, { error: 'payload_too_large' })
    return
  }

  var body
  try {
    body = JSON.parse(raw)
  } catch (e) {
    send(r, 400, { error: 'bad_request', detail: 'body is not JSON' })
    return
  }

  var built = policy.buildUpstreamBody(body, id)
  if (built.error !== undefined) {
    send(r, 400, { error: 'bad_request', detail: built.error })
    return
  }

  ngx.fetch(upstream, {
    method: 'POST',
    // Built from the allowlist. Nothing from the incoming request's headers is
    // copied: not Authorization, not Cookie, not Origin.
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(built.fields),
  })
    .then(function (reply) {
      return reply.text().then(function (text) {
        return { status: reply.status, text: text }
      })
    })
    .then(function (result) {
      var parsed
      try {
        parsed = JSON.parse(result.text)
      } catch (e) {
        parsed = {}
      }
      send(r, result.status, policy.only(parsed, policy.shapeFor(path)))
    })
    .catch(function () {
      // Never the upstream error verbatim: it can carry a URL, and a URL in an
      // error message is how internal shape leaks.
      send(r, 502, { error: 'upstream_failed' })
    })
}

export default { config: config, device: device }

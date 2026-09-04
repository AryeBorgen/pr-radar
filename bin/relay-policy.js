/**
 * What the auth relay will and will not do, as pure functions.
 *
 * Two servers ship this project: `bin/pr-radar.js` for `npx pr-radar`, and
 * nginx in the container. Both need the relay, and a second implementation of
 * security-sensitive code is the thing that drifts silently -- one of them
 * quietly stops checking something and nobody finds out until it matters.
 *
 * So there is one implementation of the *policy* and two adapters for the I/O.
 * nginx runs it through its JavaScript module; Node imports it directly. This
 * file therefore uses nothing either engine lacks: no Node builtins, no
 * `fetch`, no `Buffer`, and only syntax njs supports.
 *
 * Tested once, in tests/node/relay.test.js, and again through both servers over
 * HTTP in tests/node/conformance.test.js -- because "the container agrees with
 * the CLI" is not something to take on faith.
 *
 * One default export, because nginx's JavaScript module supports no other kind:
 * a named export is a startup error there, which is at least loud.
 */

/** Bodies here are four short fields. Anything larger is not this protocol. */
var MAX_BODY_BYTES = 4096

/** A hung upstream must not hold a browser connection open indefinitely. */
var UPSTREAM_TIMEOUT_MS = 15000

/**
 * The two upstreams, as constants.
 *
 * Nothing in a request names a host, a path or a scheme. A relay that took its
 * target from the caller would be an open proxy running on a developer's
 * machine, which is a hole opened in the name of convenience.
 */
var UPSTREAMS = {
  '/auth/device/code': 'https://github.com/login/device/code',
  '/auth/device/token': 'https://github.com/login/oauth/access_token',
}

/**
 * What may be forwarded, and what each field may look like.
 *
 * An allowlist with patterns, not a denylist with presence checks. A `scope`
 * carrying a newline is how a header gets injected; a `device_code` carrying a
 * path is how a forwarder becomes a way to probe something else.
 */
var FIELDS = {
  device_code: /^[A-Za-z0-9._-]{1,256}$/,
  grant_type: /^urn:ietf:params:oauth:grant-type:device_code$/,
  scope: /^[A-Za-z0-9:_, -]{0,200}$/,
  refresh_token: /^[A-Za-z0-9._-]{1,256}$/,
}

/** Response fields the flow uses. Everything else upstream sends is dropped. */
var DEVICE_CODE_FIELDS = [
  'device_code', 'user_code', 'verification_uri', 'expires_in', 'interval',
]

/**
 * `error` is in this list on purpose. GitHub answers a *pending* poll with HTTP
 * 200 and an `error` field, so dropping it would turn every poll before the
 * user finishes into an empty success.
 */
var TOKEN_FIELDS = [
  'access_token', 'refresh_token', 'expires_in', 'token_type', 'scope', 'error', 'interval',
]

/** Pick the named fields, if present, into a fresh object. */
function only(source, names) {
  var out = {}
  if (typeof source !== 'object' || source === null) return out
  for (var i = 0; i < names.length; i++) {
    if (source[names[i]] !== undefined) out[names[i]] = source[names[i]]
  }
  return out
}

/** Which upstream a path forwards to, or null if the path is not one of ours. */
function upstreamFor(path) {
  return Object.prototype.hasOwnProperty.call(UPSTREAMS, path) ? UPSTREAMS[path] : null
}

/** Which response fields a path's reply is rebuilt from. */
function shapeFor(path) {
  return path === '/auth/device/code' ? DEVICE_CODE_FIELDS : TOKEN_FIELDS
}

/**
 * Build the body to forward, or say why it will not be forwarded.
 *
 * The client id comes from the server's own configuration and never from the
 * request. A caller that could choose it could run a flow for an application
 * the user never installed, using the user's machine to do it.
 */
function buildUpstreamBody(body, clientId) {
  if (typeof body !== 'object' || body === null) {
    return { error: 'body is not an object' }
  }
  var fields = { client_id: clientId }
  var names = Object.keys(FIELDS)
  for (var i = 0; i < names.length; i++) {
    var name = names[i]
    var value = body[name]
    if (value === undefined) continue
    if (typeof value !== 'string' || !FIELDS[name].test(value)) {
      return { error: name + ' is not acceptable' }
    }
    fields[name] = value
  }
  return { fields: fields }
}

/**
 * Every origin the page could legitimately be served from on this host.
 *
 * Requiring `application/json` already forces a cross-origin caller to
 * preflight, and no CORS header is ever sent, so that preflight fails. This is
 * the second lock: a page elsewhere can still send a form-encoded POST with no
 * preflight and, while it could not read the reply, it could start sign-in
 * attempts against the user's machine.
 */
function originsFor(host, port) {
  var names = [host, 'localhost', '127.0.0.1', '[::1]']
  var out = {}
  for (var i = 0; i < names.length; i++) {
    out['http://' + names[i] + ':' + port] = true
    out['https://' + names[i] + ':' + port] = true
    // Port 80 and 443 are omitted from an Origin header by the browser.
    if (port === 80) out['http://' + names[i]] = true
    if (port === 443) out['https://' + names[i]] = true
  }
  return out
}

/**
 * Is the request from the page this server serves?
 *
 * No Origin header at all means it is not a browser page -- curl, a health
 * check, a container probe. Those cannot be driven by a hostile site, which is
 * the threat this closes.
 */
function originAllowed(origin, origins) {
  if (origin === undefined || origin === null || origin === '') return true
  return origins[origin] === true
}

export default {
  MAX_BODY_BYTES: MAX_BODY_BYTES,
  UPSTREAM_TIMEOUT_MS: UPSTREAM_TIMEOUT_MS,
  UPSTREAMS: UPSTREAMS,
  FIELDS: FIELDS,
  DEVICE_CODE_FIELDS: DEVICE_CODE_FIELDS,
  TOKEN_FIELDS: TOKEN_FIELDS,
  only: only,
  upstreamFor: upstreamFor,
  shapeFor: shapeFor,
  buildUpstreamBody: buildUpstreamBody,
  originsFor: originsFor,
  originAllowed: originAllowed,
}

/**
 * The `/push/` endpoints, and the rule about what may be rung.
 *
 * The notifier sends a POST to whatever address a browser hands it, which makes
 * an unchecked endpoint the same hole `bin/relay-policy.js` refuses to open:
 * something on your machine that will make a request anywhere you name. A push
 * endpoint is always an `https:` URL on a public host, so anything else is not
 * a push endpoint and is refused -- an allowlist of shapes, not a hunt for
 * known-bad ones.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RepoRef } from '../types'
import type { Notifier } from './notifier'
import type { Subscription } from './state'

/** A few short fields and a URL. Anything larger is not this protocol. */
const MAX_BODY_BYTES = 8192

/**
 * Hosts that are not on the internet.
 *
 * Not exhaustive and not meant to be: a push endpoint is a public service, so
 * anything resolving to this machine or a private network is definitionally not
 * one. With the `https:` requirement, that removes the shapes which would make
 * a forwarder useful to somebody else.
 *
 * Written out rather than as one regular expression, because the compact
 * version rejected `fcm.googleapis.com` -- the branch meaning "IPv6
 * unique-local, fc00::/7" also matched the first two letters of the push
 * service every Chrome in the world uses. Caught immediately by asking the
 * check about the endpoints a browser really returns, which is why that test
 * lists them by name.
 */
export function privateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return true

  // IPv6 arrives from `URL` wrapped in brackets, and only in brackets -- which
  // is what keeps this from looking at a name that merely starts with "fc".
  if (host.startsWith('[')) {
    const address = host.slice(1, -1)
    return address === '::1' || address === '::' || /^f[cd]/.test(address) || /^fe80:/.test(address)
  }

  const octets = host.split('.')
  if (octets.length !== 4 || !octets.every((part) => /^\d{1,3}$/.test(part))) return false
  const [a, b] = octets.map(Number) as [number, number, number, number]
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

/** Whether this is somewhere a push service could actually live. */
export function validEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  return !privateHost(url.hostname)
}

function validRepo(repo: unknown): repo is RepoRef {
  const candidate = repo as RepoRef | null
  return (
    !!candidate &&
    typeof candidate.owner === 'string' &&
    typeof candidate.name === 'string' &&
    /^[\w.-]{1,100}$/.test(candidate.owner) &&
    /^[\w.-]{1,100}$/.test(candidate.name)
  )
}

/**
 * What a browser may ask this server to watch for it.
 *
 * Headlines are the browser's own words -- this server has no catalogue and
 * translates nothing -- so they are length-capped and otherwise taken as given.
 * They are shown by the same browser that sent them.
 */
export function readSubscription(body: unknown): { value: Subscription } | { error: string } {
  const input = body as Record<string, unknown> | null
  if (!input || typeof input !== 'object') return { error: 'not an object' }
  if (!validEndpoint(input.endpoint)) {
    return { error: 'endpoint must be an https URL on a public host' }
  }
  const repos = input.repos
  if (!Array.isArray(repos) || repos.length === 0) return { error: 'repos must be a non-empty list' }
  if (repos.length > 200) return { error: 'too many repositories' }
  if (!repos.every(validRepo)) return { error: 'a repository is not owner/name' }

  const enabled: Record<string, boolean> = {}
  for (const [id, on] of Object.entries((input.enabled ?? {}) as Record<string, unknown>)) {
    if (id.length <= 64) enabled[id] = on === true
  }
  const headlines: Record<string, string> = {}
  for (const [id, text] of Object.entries((input.headlines ?? {}) as Record<string, unknown>)) {
    if (typeof text === 'string' && text.length <= 200) headlines[id] = text
  }

  return {
    value: {
      endpoint: input.endpoint,
      // Rebuilt rather than passed through, so nothing else on the object is
      // stored by accident -- `p256dh` and `auth` above all.
      repos: (repos as RepoRef[]).map((r) => ({ owner: r.owner, name: r.name })),
      enabled,
      headlines,
    },
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('too large'), { tooLarge: true }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

/**
 * Handle everything under `/push/`.
 *
 * `notifier` is absent when the server was started without `--push`, and then
 * every route answers 404 -- the same answer `/auth/config` gives when there is
 * no client id. The page asks, is told no, and offers nothing rather than
 * showing a switch that cannot work.
 */
export async function handlePush(
  request: IncomingMessage,
  response: ServerResponse,
  { notifier, headers = {} }: { notifier?: Notifier | null; headers?: Record<string, string> },
): Promise<void> {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname
  const send = (status: number, body: unknown) => {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      // Never cacheable: the answer depends on state this server holds, not on
      // the URL that asked for it.
      'Cache-Control': 'no-store',
      ...headers,
    })
    response.end(JSON.stringify(body))
  }

  if (!notifier) {
    send(404, { error: 'push is not enabled on this server' })
    return
  }

  if (path === '/push/config' && request.method === 'GET') {
    send(200, {
      key: notifier.vapidPublicKey,
      // So the page can say whose pull requests are being watched. If the
      // server signed in as somebody else, the notifications would be about
      // them, and silently disagreeing with the tab is worse than saying so.
      viewer: notifier.viewer,
      subscriptions: notifier.subscriptionCount,
    })
    return
  }

  if (request.method !== 'POST') {
    send(405, { error: 'method not allowed' })
    return
  }

  let body: unknown
  try {
    body = JSON.parse(await readBody(request))
  } catch (error) {
    send((error as { tooLarge?: boolean })?.tooLarge ? 413 : 400, { error: 'unreadable body' })
    return
  }

  const endpointOf = (value: unknown) => (value as { endpoint?: unknown } | null)?.endpoint

  if (path === '/push/subscribe') {
    const result = readSubscription(body)
    if ('error' in result) {
      send(400, { error: result.error })
      return
    }
    notifier.subscribe(result.value)
    // Poll straight away, so the baseline is established while the tab is still
    // open rather than up to an interval later.
    void notifier.poll().catch(() => {})
    send(200, { ok: true, subscriptions: notifier.subscriptionCount })
    return
  }

  if (path === '/push/unsubscribe') {
    const endpoint = endpointOf(body)
    if (!validEndpoint(endpoint)) {
      send(400, { error: 'endpoint must be an https URL on a public host' })
      return
    }
    send(200, { ok: notifier.unsubscribe(endpoint) })
    return
  }

  if (path === '/push/pending') {
    // A service worker woken by a doorbell, asking what to show.
    const endpoint = endpointOf(body)
    if (!validEndpoint(endpoint)) {
      send(400, { error: 'endpoint must be an https URL on a public host' })
      return
    }
    send(200, { notifications: notifier.collect(endpoint) })
    return
  }

  send(404, { error: 'no such route' })
}

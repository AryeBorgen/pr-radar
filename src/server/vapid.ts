/**
 * VAPID: proving to a push service that this server is who it says it is.
 *
 * No dependency, because the whole of VAPID is a P-256 key pair and a
 * short-lived JWT and `node:crypto` does both. The usual reason to install a
 * library here is payload encryption (RFC 8291) -- see `notifier.ts` for why
 * this project sends no payloads and therefore needs none of it.
 *
 * Two things in here are easy to get wrong and silent when you do:
 *
 * 1. **ES256 wants a raw signature, not DER.** `node:crypto` signs ECDSA into
 *    an ASN.1 DER structure by default; JWS specifies the bare `r || s`, 64
 *    bytes. A DER signature is well-formed, verifies with `crypto.verify`, and
 *    is rejected by every push service with a 401 that explains nothing.
 *    `dsaEncoding: 'ieee-p1363'` is what asks for the JWS form.
 * 2. **The audience is the push endpoint's origin, not the endpoint.** Sending
 *    the whole URL is another 401.
 */
import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'

/** The parts of a JWK this uses. `d` is present only on a private key. */
export interface EcJwk {
  kty?: string
  crv?: string
  x?: string
  y?: string
  d?: string
}

export interface VapidKeys {
  publicKey: EcJwk
  privateKey: EcJwk
}

/** Base64url, which JWS uses and `Buffer` does not produce by default. */
function b64url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

/**
 * A new application server key pair, stored as JWK.
 *
 * JWK rather than PEM because it round-trips through `JSON.stringify` into the
 * state file without a second encoding, and because the key the browser needs
 * is derived from the same `x` and `y`.
 */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  return {
    publicKey: publicKey.export({ format: 'jwk' }) as EcJwk,
    privateKey: privateKey.export({ format: 'jwk' }) as EcJwk,
  }
}

/**
 * The `applicationServerKey` a browser passes to `pushManager.subscribe`.
 *
 * An uncompressed EC point: a `0x04` tag then two 32-byte coordinates. A JWK is
 * refused there, and a coordinate that decodes to 31 bytes -- which happens
 * whenever a leading zero has been trimmed somewhere -- makes `subscribe()`
 * reject with a DOMException naming nothing. Both halves are checked here,
 * where the cause is still visible.
 */
export function publicKeyForBrowser(jwk: EcJwk): string {
  const x = Buffer.from(jwk.x ?? '', 'base64url')
  const y = Buffer.from(jwk.y ?? '', 'base64url')
  if (x.length !== 32 || y.length !== 32) {
    throw new Error(`vapid: expected 32-byte coordinates, got x=${x.length} y=${y.length}`)
  }
  return b64url(Buffer.concat([Buffer.from([4]), x, y]))
}

/** The origin of a push endpoint, which is what the JWT's `aud` must carry. */
export function audienceFor(endpoint: string): string {
  return new URL(endpoint).origin
}

const MAX_EXPIRY_SECONDS = 24 * 60 * 60

export interface JwtOptions {
  endpoint: string
  subject: string
  privateKeyJwk: EcJwk
  now?: number
  expiresInSeconds?: number
}

/**
 * A signed VAPID JWT for one push service.
 *
 * `expiresInSeconds` is capped at twenty-four hours because that is the ceiling
 * the spec gives and services enforce it. `subject` must be a `mailto:` or
 * `https:` URL: it is how a push service reaches whoever is sending, and a bare
 * string is rejected -- there rather than here, unless this refuses first.
 */
export function vapidJwt({
  endpoint,
  subject,
  privateKeyJwk,
  now = Date.now(),
  expiresInSeconds = 12 * 60 * 60,
}: JwtOptions): string {
  if (!/^(mailto:|https:)/.test(subject)) {
    throw new Error(`vapid: subject must be a mailto: or https: URL, got ${JSON.stringify(subject)}`)
  }
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        aud: audienceFor(endpoint),
        exp: Math.floor(now / 1000) + Math.min(expiresInSeconds, MAX_EXPIRY_SECONDS),
        sub: subject,
      }),
    ),
  )
  const signingInput = `${header}.${payload}`

  // A JWK has to become a KeyObject before it can sign: the inline
  // `{ key, format }` shape is for PEM and DER and is rejected for a JWK.
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey({ key: privateKeyJwk as never, format: 'jwk' }),
    // The JWS form. Without this the signature is DER, and every push service
    // answers 401 without saying why.
    dsaEncoding: 'ieee-p1363',
  })

  return `${signingInput}.${b64url(signature)}`
}

/**
 * The headers for a payload-less push -- a doorbell.
 *
 * No `Content-Encoding` and no body, which is what makes this legal without an
 * RFC 8291 implementation. `TTL` is required: a service may refuse a request
 * without one, and zero would mean "deliver this instant or never".
 */
export function pushHeaders({
  endpoint,
  subject,
  keys,
  now = Date.now(),
  ttlSeconds = 12 * 60 * 60,
}: {
  endpoint: string
  subject: string
  keys: VapidKeys
  now?: number
  ttlSeconds?: number
}): Record<string, string> {
  const jwt = vapidJwt({ endpoint, subject, privateKeyJwk: keys.privateKey, now })
  return {
    Authorization: `vapid t=${jwt}, k=${publicKeyForBrowser(keys.publicKey)}`,
    TTL: String(ttlSeconds),
    'Content-Length': '0',
  }
}

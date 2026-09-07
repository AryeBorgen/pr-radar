// @vitest-environment node
import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { audienceFor, generateVapidKeys, publicKeyForBrowser, pushHeaders, vapidJwt } from './vapid'

/**
 * VAPID, checked against the shapes a push service actually enforces.
 *
 * None of this can be verified by reading it: a DER signature and a JWS
 * signature both look fine and only one is accepted, and the difference arrives
 * as a 401 that explains nothing. So each assertion here is a property a push
 * service tests for, checked with `node:crypto` rather than by sending anything
 * to Google.
 */

const KEYS = generateVapidKeys()
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/cLmN0pQ'
const SUBJECT = 'mailto:nobody@example.com'

describe('the application server key', () => {
  it('is an uncompressed EC point of exactly 65 bytes', () => {
    // What `pushManager.subscribe` accepts; a JWK is refused there.
    const raw = Buffer.from(publicKeyForBrowser(KEYS.publicKey), 'base64url')

    expect(raw.length).toBe(65)
    expect(raw[0]).toBe(4)
  })

  it('refuses a coordinate that is not 32 bytes', () => {
    // Otherwise the failure is a subscribe() rejecting in the browser, a long
    // way from the key that caused it.
    expect(() =>
      publicKeyForBrowser({ x: Buffer.alloc(31).toString('base64url'), y: KEYS.publicKey.y ?? '' }),
    ).toThrow(/32-byte coordinates/)
  })
})

describe('the JWT', () => {
  it('is signed in the JWS form, not DER', () => {
    /*
     * The one that costs a debugging cycle. `node:crypto` produces ASN.1 DER
     * for ECDSA unless told otherwise: about seventy bytes, verifiable with
     * `crypto.verify`, and rejected by every push service. JWS wants the bare
     * r || s -- always sixty-four.
     */
    const [, , signature] = vapidJwt({
      endpoint: ENDPOINT,
      subject: SUBJECT,
      privateKeyJwk: KEYS.privateKey,
    }).split('.')

    expect(Buffer.from(signature ?? '', 'base64url').length).toBe(64)
  })

  it('verifies against the public key the browser was given', () => {
    // Not a tautology: it proves the pair in the state file and the key handed
    // to `subscribe()` are two ends of the same thing.
    const [header, payload, signature] = vapidJwt({
      endpoint: ENDPOINT,
      subject: SUBJECT,
      privateKeyJwk: KEYS.privateKey,
    }).split('.')

    const ok = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      {
        key: createPublicKey({ key: KEYS.publicKey as never, format: 'jwk' }),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(signature ?? '', 'base64url'),
    )

    expect(ok).toBe(true)
  })

  it('claims the origin as its audience, never the whole endpoint', () => {
    // Sending the endpoint is another 401 that says nothing about why.
    const [, payload] = vapidJwt({
      endpoint: ENDPOINT,
      subject: SUBJECT,
      privateKeyJwk: KEYS.privateKey,
    }).split('.')

    expect(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()).aud).toBe(
      'https://fcm.googleapis.com',
    )
    expect(audienceFor(ENDPOINT)).toBe('https://fcm.googleapis.com')
  })

  it('never expires more than twenty-four hours out', () => {
    // The ceiling the spec gives and services enforce. A week is asked for here.
    const now = 1_700_000_000_000
    const [, payload] = vapidJwt({
      endpoint: ENDPOINT,
      subject: SUBJECT,
      privateKeyJwk: KEYS.privateKey,
      now,
      expiresInSeconds: 7 * 24 * 60 * 60,
    }).split('.')

    expect(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()).exp).toBe(
      Math.floor(now / 1000) + 24 * 60 * 60,
    )
  })

  it('refuses a subject that is not a mailto: or https: URL', () => {
    expect(() =>
      vapidJwt({ endpoint: ENDPOINT, subject: 'pr-radar', privateKeyJwk: KEYS.privateKey }),
    ).toThrow(/mailto: or https:/)
  })
})

describe('the request headers', () => {
  it('carry the token and the key, and declare no body', () => {
    const headers = pushHeaders({ endpoint: ENDPOINT, subject: SUBJECT, keys: KEYS })

    expect(headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/)
    expect(headers['Content-Length']).toBe('0')
    expect(Number(headers.TTL)).toBeGreaterThan(0)
  })

  it('declare no content encoding, because there is no payload', () => {
    /*
     * The reason this project needs no RFC 8291 implementation. A
     * `Content-Encoding` here would promise an encrypted body that is not being
     * sent, and the push service would refuse the request.
     */
    expect(pushHeaders({ endpoint: ENDPOINT, subject: SUBJECT, keys: KEYS })['Content-Encoding'])
      .toBeUndefined()
  })
})

// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readSubscription, validEndpoint } from './push'

/**
 * What this server can be talked into ringing.
 *
 * The notifier sends a POST to whatever address a browser gave it, so an
 * unchecked endpoint turns a program on somebody's laptop into a thing that
 * will make a request anywhere a caller names -- the same hole
 * `bin/relay-policy.js` exists to refuse. These are attempts to get past it,
 * in the spirit of tests/node/relay.test.js: a restriction nobody has tried to
 * break is a comment.
 */

const REAL = 'https://fcm.googleapis.com/fcm/send/cLmN0pQ'

describe('the endpoint rule', () => {
  it('accepts the push services a browser actually returns', () => {
    for (const endpoint of [
      REAL,
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAA',
      'https://web.push.apple.com/QBCD',
      'https://wns2-by3p.notify.windows.com/w/?token=abc',
    ]) {
      expect(validEndpoint(endpoint), endpoint).toBe(true)
    }
  })

  it('refuses anything that is not https', () => {
    // http would also mean a VAPID token crossing the network in the clear.
    expect(validEndpoint('http://fcm.googleapis.com/fcm/send/x')).toBe(false)
    expect(validEndpoint('file:///etc/passwd')).toBe(false)
    expect(validEndpoint('ftp://example.com/x')).toBe(false)
  })

  it('refuses this machine and the private networks around it', () => {
    /*
     * The actual attack: a page that can subscribe with an internal address
     * turns the notifier into a way to reach things only this host can reach.
     * A push service is public by definition, so none of these can be one.
     */
    for (const endpoint of [
      'https://localhost/ring',
      'https://127.0.0.1/ring',
      'https://[::1]/ring',
      'https://10.0.0.5/ring',
      'https://192.168.1.10/ring',
      'https://172.16.4.4/ring',
      'https://169.254.169.254/latest/meta-data/',
    ]) {
      expect(validEndpoint(endpoint), endpoint).toBe(false)
    }
  })

  it('refuses what is not a URL at all, or is absurdly long', () => {
    expect(validEndpoint('')).toBe(false)
    expect(validEndpoint('not a url')).toBe(false)
    expect(validEndpoint(null)).toBe(false)
    expect(validEndpoint({ endpoint: REAL })).toBe(false)
    expect(validEndpoint(`https://push.example.com/${'a'.repeat(3000)}`)).toBe(false)
  })
})

describe('what a browser may ask us to watch', () => {
  const ok = {
    endpoint: REAL,
    repos: [{ owner: 'acme', name: 'web' }],
    enabled: { 'ci-failed': true },
    headlines: { 'ci-failed': 'CI failed' },
  }

  it('accepts a well-formed subscription', () => {
    const result = readSubscription(ok)

    expect('value' in result && result.value.endpoint).toBe(REAL)
    expect('value' in result && result.value.repos).toEqual([{ owner: 'acme', name: 'web' }])
  })

  it('keeps the address to ring and drops the keys that would encrypt a payload', () => {
    /*
     * Deliberate. `p256dh` and `auth` are what RFC 8291 needs to encrypt
     * content; this never sends content, so keeping them would be holding a
     * capability the design has decided not to have. A state file that could
     * put arbitrary text on somebody's lock screen is a different object from
     * one that can only ring.
     */
    const result = readSubscription({ ...ok, keys: { p256dh: 'MUST-NOT-BE-KEPT', auth: 'NOR-THIS' } })

    expect(JSON.stringify(result)).not.toContain('MUST-NOT-BE-KEPT')
    expect(JSON.stringify(result)).not.toContain('p256dh')
  })

  it('refuses a repository that is not owner/name', () => {
    // These reach a URL. A slash or a `..` in either half is a path, not a name.
    expect(readSubscription({ ...ok, repos: [{ owner: '../..', name: 'web' }] })).toHaveProperty('error')
    expect(readSubscription({ ...ok, repos: [{ owner: 'acme', name: 'a/b' }] })).toHaveProperty('error')
    expect(readSubscription({ ...ok, repos: [{ owner: 'acme' }] })).toHaveProperty('error')
  })

  it('refuses an empty or oversized repository list', () => {
    // An empty list would mean a subscription that can never fire; a huge one
    // would mean a poll that never finishes.
    expect(readSubscription({ ...ok, repos: [] })).toHaveProperty('error')
    expect(
      readSubscription({ ...ok, repos: Array.from({ length: 201 }, () => ({ owner: 'a', name: 'b' })) }),
    ).toHaveProperty('error')
  })

  it('treats anything but true as off', () => {
    // The rules decide what interrupts somebody. "truthy" is not good enough.
    const result = readSubscription({ ...ok, enabled: { 'ci-failed': 'yes', approved: true } })

    expect('value' in result && result.value.enabled).toEqual({ 'ci-failed': false, approved: true })
  })

  it('caps a headline rather than trusting its length', () => {
    // The browser supplies the words, but a notification title is not a place
    // to put a novel, and this is written to disk.
    const result = readSubscription({ ...ok, headlines: { 'ci-failed': 'x'.repeat(500) } })

    expect('value' in result && result.value.headlines['ci-failed']).toBeUndefined()
  })
})

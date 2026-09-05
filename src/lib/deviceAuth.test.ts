import { describe, expect, it } from 'vitest'
import {
  afterRefresh,
  credentialOf,
  refreshDelay,
  delayUntilNextPoll,
  failureFor,
  needsRefresh,
  next,
  readDeviceCode,
  readPoll,
  REFRESH_MARGIN_MS,
  type AuthState,
} from './deviceAuth'

const T0 = 1_000_000
const waiting = (over: Partial<Extract<AuthState, { status: 'waiting' }>> = {}): AuthState => ({
  status: 'waiting',
  code: {
    userCode: 'WDJB-MJHT',
    deviceCode: 'secret',
    verificationUri: 'https://github.com/login/device',
    expiresIn: 900,
    interval: 5,
  },
  interval: 5,
  expiresAt: T0 + 900_000,
  ...over,
})

describe('reading a poll response', () => {
  // The one that would break everything: GitHub answers a *pending* poll with
  // HTTP 200 and an `error` field. Code that trusted `response.ok` would treat
  // every pending poll as a successful sign-in holding an undefined token.
  it('reads a 200 carrying an error as an error, not a success', () => {
    expect(readPoll({ error: 'authorization_pending' })).toEqual({ kind: 'pending' })
  })

  it('reads a token', () => {
    expect(readPoll({ access_token: 'gho_x' })).toEqual({ kind: 'token', token: 'gho_x' })
  })

  it('carries a refresh token and expiry when a GitHub App sends them', () => {
    expect(
      readPoll({ access_token: 'gho_x', refresh_token: 'ghr_y', expires_in: 28800 }),
    ).toEqual({ kind: 'token', token: 'gho_x', refreshToken: 'ghr_y', expiresIn: 28800 })
  })

  it('omits them entirely for an OAuth App, rather than inventing an expiry', () => {
    const result = readPoll({ access_token: 'gho_x' })
    expect(result).not.toHaveProperty('refreshToken')
    expect(result).not.toHaveProperty('expiresIn')
  })

  it('takes the interval out of a slow_down', () => {
    expect(readPoll({ error: 'slow_down', interval: 10 })).toEqual({
      kind: 'slow_down',
      interval: 10,
    })
  })

  it('refuses an empty access token instead of authenticating with nothing', () => {
    expect(readPoll({ access_token: '' })).toEqual({ kind: 'failed', reason: 'unknown' })
  })

  it.each([null, undefined, 'a string', 42, []])('refuses %p', (body) => {
    expect(readPoll(body).kind).toBe('failed')
  })
})

describe('naming the failure', () => {
  it.each([
    ['access_denied', 'denied'],
    ['expired_token', 'expired'],
    ['device_flow_disabled', 'unsupported'],
    ['incorrect_client_credentials', 'unsupported'],
  ] as const)('%s is %s', (error, reason) => {
    expect(failureFor(error)).toBe(reason)
  })

  // A login that says "you denied this" when the user did not is worse than one
  // that admits it does not know what happened.
  it('does not guess at an error it has never seen', () => {
    expect(failureFor('some_new_error_github_added')).toBe('unknown')
  })
})

describe('advancing the flow', () => {
  it('stays waiting while GitHub says pending', () => {
    expect(next(waiting(), { kind: 'pending' }, T0)).toEqual(waiting())
  })

  it('raises the interval on slow_down', () => {
    const state = next(waiting(), { kind: 'slow_down', interval: 10 }, T0)
    expect(state).toMatchObject({ status: 'waiting', interval: 10 })
  })

  // GitHub sends slow_down when the client is polling too fast. A client that
  // took the value at face value could be walked back down to a rate that earns
  // another one, which is a loop that gets the user rate-limited.
  it('never lets slow_down lower an interval it already raised', () => {
    const raised = next(waiting(), { kind: 'slow_down', interval: 10 }, T0)
    const again = next(raised, { kind: 'slow_down', interval: 1 }, T0)
    expect(again).toMatchObject({ interval: 10 })
  })

  it('authenticates on a token', () => {
    expect(next(waiting(), { kind: 'token', token: 'gho_x' }, T0)).toEqual({
      status: 'authenticated',
      token: 'gho_x',
    })
  })

  it('turns expires_in into an absolute moment', () => {
    expect(next(waiting(), { kind: 'token', token: 'x', expiresIn: 100 }, T0)).toMatchObject({
      expiresAt: T0 + 100_000,
    })
  })

  it('fails on a denial', () => {
    expect(next(waiting(), { kind: 'failed', reason: 'denied' }, T0)).toEqual({
      status: 'failed',
      reason: 'denied',
    })
  })

  it('expires once the code has, whatever the poll said', () => {
    expect(next(waiting(), { kind: 'pending' }, T0 + 900_001)).toEqual({
      status: 'failed',
      reason: 'expired',
    })
  })

  // A code GitHub has forgotten cannot have produced a token, so a token
  // arriving after expiry is a reply to something else -- or to nothing.
  it('will not accept a token that arrives after the code expired', () => {
    expect(next(waiting(), { kind: 'token', token: 'gho_x' }, T0 + 900_001)).toEqual({
      status: 'failed',
      reason: 'expired',
    })
  })

  it.each(['idle', 'starting'] as const)('does nothing while %s', (status) => {
    expect(next({ status }, { kind: 'token', token: 'x' }, T0)).toEqual({ status })
  })

  it('does not un-fail a flow that already failed', () => {
    const failed: AuthState = { status: 'failed', reason: 'denied' }
    expect(next(failed, { kind: 'token', token: 'x' }, T0)).toEqual(failed)
  })
})

describe('when to poll next', () => {
  it('waits the interval', () => {
    expect(delayUntilNextPoll(waiting(), T0)).toBe(5000)
  })

  // Otherwise the flow reports "expired" up to one interval after it expired,
  // leaving a user watching a code that has already stopped working.
  it('never sleeps past expiry', () => {
    expect(delayUntilNextPoll(waiting(), T0 + 898_000)).toBe(2000)
  })

  it('stops at expiry', () => {
    expect(delayUntilNextPoll(waiting(), T0 + 900_000)).toBeNull()
  })

  it.each(['idle', 'starting'] as const)('has nothing to schedule while %s', (status) => {
    expect(delayUntilNextPoll({ status }, T0)).toBeNull()
  })
})

describe('refreshing', () => {
  const app: AuthState = {
    status: 'authenticated',
    token: 'gho_x',
    refreshToken: 'ghr_y',
    expiresAt: T0 + 28_800_000,
  }

  it('is not needed early', () => {
    expect(needsRefresh(app, T0)).toBe(false)
  })

  // Refreshing at the exact moment of expiry means a request already in flight
  // fails. The margin is what makes it invisible instead of merely quick.
  it('starts a margin before expiry, not at it', () => {
    expect(needsRefresh(app, T0 + 28_800_000 - REFRESH_MARGIN_MS)).toBe(true)
    expect(needsRefresh(app, T0 + 28_800_000 - REFRESH_MARGIN_MS - 1)).toBe(false)
  })

  // An OAuth App token does not expire and has no refresh token. Asking to
  // refresh it would fail every time, forever.
  it('never applies to a token with no expiry', () => {
    expect(needsRefresh({ status: 'authenticated', token: 'gho_x' }, T0 + 1e12)).toBe(false)
  })

  it('never applies to an expiring token with no refresh token', () => {
    expect(
      needsRefresh({ status: 'authenticated', token: 'gho_x', expiresAt: T0 }, T0 + 1e6),
    ).toBe(false)
  })
})

describe('reading the device code', () => {
  it('normalises the documented shape', () => {
    expect(
      readDeviceCode({
        device_code: 'd', user_code: 'WDJB-MJHT',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900, interval: 5,
      }),
    ).toEqual({
      deviceCode: 'd', userCode: 'WDJB-MJHT',
      verificationUri: 'https://github.com/login/device',
      expiresIn: 900, interval: 5,
    })
  })

  it('defaults the two numbers rather than failing on them', () => {
    expect(
      readDeviceCode({ device_code: 'd', user_code: 'u', verification_uri: 'https://x' }),
    ).toMatchObject({ expiresIn: 900, interval: 5 })
  })

  it.each([
    ['no device_code', { user_code: 'u', verification_uri: 'https://x' }],
    ['no user_code', { device_code: 'd', verification_uri: 'https://x' }],
    ['no verification_uri', { device_code: 'd', user_code: 'u' }],
    ['an error instead', { error: 'device_flow_disabled' }],
    ['nothing at all', null],
  ])('refuses a response with %s', (_, body) => {
    expect(readDeviceCode(body)).toBeNull()
  })
})

describe('keeping a session alive', () => {
  const signedIn = (over: Record<string, unknown> = {}): AuthState => ({
    status: 'authenticated',
    token: 'gho_a',
    refreshToken: 'ghr_a',
    expiresAt: T0 + 28_800_000,
    ...over,
  })

  it('takes the session out of a sign-in', () => {
    expect(credentialOf(signedIn())).toEqual({
      token: 'gho_a',
      refreshToken: 'ghr_a',
      expiresAt: T0 + 28_800_000,
    })
  })

  // An application whose tokens do not expire has no refresh token and no
  // expiry, and absent is the right shape: a session with no expiry is not one
  // expiring at infinity.
  it('omits what a non-expiring application does not give', () => {
    const credential = credentialOf({ status: 'authenticated', token: 'gho_a' })
    expect(credential).toEqual({ token: 'gho_a' })
    expect(credential).not.toHaveProperty('refreshToken')
  })

  it('has nothing to take from a sign-in that has not happened', () => {
    expect(credentialOf({ status: 'waiting' } as AuthState)).toBeNull()
    expect(credentialOf({ status: 'idle' })).toBeNull()
  })

  describe('when to refresh', () => {
    it('schedules a margin before expiry', () => {
      expect(refreshDelay({ token: 'a', refreshToken: 'r', expiresAt: T0 + 28_800_000 }, T0))
        .toBe(28_800_000 - REFRESH_MARGIN_MS)
    })

    // Due now is not the same as never, and a negative delay would fire a timer
    // immediately in some runtimes and never in others.
    it('is due immediately when already past the margin', () => {
      expect(refreshDelay({ token: 'a', refreshToken: 'r', expiresAt: T0 }, T0 + 1_000_000)).toBe(0)
    })

    it('schedules nothing without a refresh token', () => {
      expect(refreshDelay({ token: 'a', expiresAt: T0 + 1000 }, T0)).toBeNull()
    })

    it('schedules nothing without an expiry', () => {
      expect(refreshDelay({ token: 'a', refreshToken: 'r' }, T0)).toBeNull()
    })

    it('schedules nothing when there is no session', () => {
      expect(refreshDelay(null, T0)).toBeNull()
    })
  })

  describe('after a refresh', () => {
    const before = { token: 'gho_old', refreshToken: 'ghr_old', expiresAt: T0 }

    /*
     * The one that would break a day later rather than immediately. GitHub
     * returns a new refresh token with every refresh and invalidates the old
     * one, so a session that kept the previous one works exactly once and then
     * signs the user out.
     */
    it('takes the new refresh token, because the old one is now dead', () => {
      expect(
        afterRefresh(before, { kind: 'token', token: 'gho_new', refreshToken: 'ghr_new', expiresIn: 28800 }, T0),
      ).toEqual({ token: 'gho_new', refreshToken: 'ghr_new', expiresAt: T0 + 28_800_000 })
    })

    // Dropping it guarantees a sign-out at the next expiry; carrying it forward
    // at worst fails once, later.
    it('carries the old one forward if a reply omits it', () => {
      expect(afterRefresh(before, { kind: 'token', token: 'gho_new', expiresIn: 100 }, T0))
        .toMatchObject({ refreshToken: 'ghr_old' })
    })

    it('produces nothing from a refusal', () => {
      expect(afterRefresh(before, { kind: 'failed', reason: 'denied' }, T0)).toBeNull()
      expect(afterRefresh(before, { kind: 'pending' }, T0)).toBeNull()
    })
  })
})


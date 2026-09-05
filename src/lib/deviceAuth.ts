/**
 * The device flow, as a pure function of what GitHub last said.
 *
 * The flow is a loop with a clock in it, and a loop with a clock in it is the
 * kind of code that is fine until the day it is not: a poll that ignores
 * `slow_down` gets the client rate-limited, one that ignores `expires_in` spins
 * forever on a code GitHub has already forgotten. None of that is testable while
 * it is tangled up with `fetch` and `setTimeout`, so none of it lives here.
 *
 * `next()` takes the current state and one response and returns the next state.
 * The hook does the waiting; this decides what waiting means.
 */

/** What GitHub returns from `POST /login/device/code`. */
export interface DeviceCode {
  /** Shown to the user. Typed into github.com/login/device. */
  userCode: string
  /** Sent back to identify this attempt. Never shown -- it is the credential. */
  deviceCode: string
  /** Where to type the user code. */
  verificationUri: string
  /** Seconds until the code stops working. */
  expiresIn: number
  /** Seconds between polls. GitHub's floor, not a suggestion. */
  interval: number
}

export type AuthState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'waiting'; code: DeviceCode; interval: number; expiresAt: number }
  | { status: 'authenticated'; token: string; refreshToken?: string; expiresAt?: number }
  | { status: 'failed'; reason: AuthFailure }

/**
 * Why a sign-in stopped. Separated from the message because the message is
 * translated and the reason is not -- and because `denied` and `expired` want
 * different offers ("try again" versus "that took too long").
 */
export type AuthFailure = 'denied' | 'expired' | 'unsupported' | 'network' | 'unknown'

/** A poll's outcome, normalised out of GitHub's error vocabulary. */
export type PollResult =
  | { kind: 'pending' }
  /** GitHub asking to be polled less often. The new interval is mandatory. */
  | { kind: 'slow_down'; interval: number }
  | { kind: 'token'; token: string; refreshToken?: string; expiresIn?: number }
  | { kind: 'failed'; reason: AuthFailure }

/**
 * GitHub's documented device-flow errors. Anything not listed is `unknown`
 * rather than being folded into one of these: a login that says "you denied
 * this" when the user did not is worse than one that admits it does not know.
 */
export function failureFor(error: string): AuthFailure {
  switch (error) {
    case 'access_denied':
      return 'denied'
    case 'expired_token':
    case 'device_flow_disabled':
      return error === 'expired_token' ? 'expired' : 'unsupported'
    case 'unsupported_grant_type':
    case 'incorrect_client_credentials':
    case 'incorrect_device_code':
      return 'unsupported'
    default:
      return 'unknown'
  }
}

/**
 * The next state, given the current one and a poll result.
 *
 * `slow_down` raises the interval and never lowers it. GitHub sends it when the
 * client is polling too fast, and a client that treated it as a fresh value
 * could be talked back down to a rate that earns another one.
 */
export function next(state: AuthState, result: PollResult, now: number): AuthState {
  if (state.status !== 'waiting') return state

  // Expiry beats everything, including a token: a code GitHub has forgotten
  // cannot have produced one, so a `token` arriving after expiry is not trusted.
  if (now >= state.expiresAt) return { status: 'failed', reason: 'expired' }

  switch (result.kind) {
    case 'pending':
      return state
    case 'slow_down':
      return { ...state, interval: Math.max(state.interval, result.interval) }
    case 'failed':
      return { status: 'failed', reason: result.reason }
    case 'token':
      return {
        status: 'authenticated',
        token: result.token,
        ...(result.refreshToken === undefined ? {} : { refreshToken: result.refreshToken }),
        ...(result.expiresIn === undefined ? {} : { expiresAt: now + result.expiresIn * 1000 }),
      }
  }
}

/** Milliseconds to wait before the next poll, or `null` if there is no next poll. */
export function delayUntilNextPoll(state: AuthState, now: number): number | null {
  if (state.status !== 'waiting') return null
  const remaining = state.expiresAt - now
  if (remaining <= 0) return null
  // Never sleep past expiry: the flow should report "expired" at the moment it
  // expires, not one poll interval later.
  return Math.min(state.interval * 1000, remaining)
}

/**
 * Is a user-to-server token close enough to expiry to be worth refreshing?
 *
 * A GitHub App token lasts eight hours. Refreshing on the minute it expires
 * means a request in flight at that moment fails; the margin is what makes the
 * refresh invisible rather than merely quick.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000

export function needsRefresh(state: AuthState, now: number): boolean {
  return (
    state.status === 'authenticated' &&
    state.refreshToken !== undefined &&
    state.expiresAt !== undefined &&
    now >= state.expiresAt - REFRESH_MARGIN_MS
  )
}

/**
 * A signed-in session: the token, and what is needed to keep it alive.
 *
 * `refreshToken` and `expiresAt` are absent for an application whose tokens do
 * not expire, and absent is the right shape for that -- a session with no
 * expiry is not a session expiring at infinity, and code that treats it as one
 * ends up scheduling a refresh in the year 275760.
 */
export interface Credential {
  token: string
  refreshToken?: string
  expiresAt?: number
}

/** The session a successful sign-in produced, or null if it is not one. */
export function credentialOf(state: AuthState): Credential | null {
  if (state.status !== 'authenticated') return null
  return {
    token: state.token,
    ...(state.refreshToken === undefined ? {} : { refreshToken: state.refreshToken }),
    ...(state.expiresAt === undefined ? {} : { expiresAt: state.expiresAt }),
  }
}

/**
 * How long to wait before refreshing, or null if there is nothing to schedule.
 *
 * Null covers three different situations that all mean the same thing to a
 * timer: no refresh token, no expiry, and a session that is already past due.
 * The last one returns 0 rather than null -- it is due *now*, which is not the
 * same as never.
 */
export function refreshDelay(credential: Credential | null, now: number): number | null {
  if (credential === null) return null
  if (credential.refreshToken === undefined || credential.expiresAt === undefined) return null
  return Math.max(0, credential.expiresAt - REFRESH_MARGIN_MS - now)
}

/**
 * The session a refresh produced.
 *
 * GitHub returns a *new* refresh token with each refresh and invalidates the
 * old one, so keeping the previous one would work exactly once. When a response
 * omits it -- which it should not -- the old one is carried forward rather than
 * dropped, since dropping it guarantees a sign-out at the next expiry.
 */
export function afterRefresh(previous: Credential, result: PollResult, now: number): Credential | null {
  if (result.kind !== 'token') return null
  const refreshToken = result.refreshToken ?? previous.refreshToken
  return {
    token: result.token,
    ...(refreshToken === undefined ? {} : { refreshToken }),
    ...(result.expiresIn === undefined ? {} : { expiresAt: now + result.expiresIn * 1000 }),
  }
}

/**
 * Normalise one poll response body.
 *
 * GitHub answers the device-flow poll with HTTP 200 and an `error` field, not a
 * status code, so the shape of a rejection and the shape of a success are the
 * same shape. Reading `response.ok` here would report every pending poll as a
 * successful sign-in with an undefined token.
 */
export function readPoll(body: unknown): PollResult {
  if (typeof body !== 'object' || body === null) return { kind: 'failed', reason: 'unknown' }
  const data = body as Record<string, unknown>

  if (typeof data['error'] === 'string') {
    const error = data['error']
    if (error === 'authorization_pending') return { kind: 'pending' }
    if (error === 'slow_down') {
      const interval = typeof data['interval'] === 'number' ? data['interval'] : 0
      return { kind: 'slow_down', interval }
    }
    return { kind: 'failed', reason: failureFor(error) }
  }

  if (typeof data['access_token'] === 'string' && data['access_token'] !== '') {
    return {
      kind: 'token',
      token: data['access_token'],
      ...(typeof data['refresh_token'] === 'string'
        ? { refreshToken: data['refresh_token'] }
        : {}),
      ...(typeof data['expires_in'] === 'number' ? { expiresIn: data['expires_in'] } : {}),
    }
  }

  return { kind: 'failed', reason: 'unknown' }
}

/** Normalise the device-code response, rejecting anything missing a field the flow needs. */
export function readDeviceCode(body: unknown): DeviceCode | null {
  if (typeof body !== 'object' || body === null) return null
  const data = body as Record<string, unknown>

  const userCode = data['user_code']
  const deviceCode = data['device_code']
  const verificationUri = data['verification_uri']
  if (typeof userCode !== 'string' || typeof deviceCode !== 'string') return null
  if (typeof verificationUri !== 'string') return null

  return {
    userCode,
    deviceCode,
    verificationUri,
    // GitHub documents 900 and 5. Defaulting rather than failing keeps a login
    // working if they are ever omitted, and the expiry check still bounds it.
    expiresIn: typeof data['expires_in'] === 'number' ? data['expires_in'] : 900,
    interval: typeof data['interval'] === 'number' ? data['interval'] : 5,
  }
}

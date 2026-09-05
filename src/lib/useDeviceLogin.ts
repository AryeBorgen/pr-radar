import { useCallback, useEffect, useRef, useState } from 'react'
import {
  credentialOf,
  delayUntilNextPoll,
  needsRefresh,
  next,
  readDeviceCode,
  readPoll,
  type AuthState,
  type Credential,
} from './deviceAuth'

/**
 * The I/O half of the device flow. Every decision it makes is in deviceAuth.ts,
 * which is pure and unit-tested; this waits, fetches and cleans up.
 *
 * The relay it talks to is same-origin, and only exists when the app is served
 * by something that can relay -- `npx pr-radar` or the container. On a static
 * host `/auth/config` answers 404, which is not an error: it is the correct
 * answer, and the page shows the token field alone.
 */

export interface DeviceLoginConfig {
  /** null while unknown, false where there is no relay. */
  available: boolean | null
}

/**
 * Where the relay lives.
 *
 * Empty means same-origin, which is the case for `npx pr-radar` and the
 * container: the thing serving the page is the thing that relays. A static host
 * has neither, so a build for one is given the URL of a relay that does --
 * substituted at build time, because it is a property of the deployment rather
 * than of the user.
 *
 * Trailing slash removed so the two are joined the same way either way.
 */
const RELAY = (import.meta.env.VITE_PR_RADAR_RELAY ?? '').replace(/\/$/, '')

function relayUrl(path: string): string {
  return RELAY + path
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(relayUrl(path), {
    method: 'POST',
    // Deliberately JSON: it forces a preflight on any cross-origin caller, and
    // the relay answers none. See bin/relay-policy.js.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return response.json().catch(() => ({}))
}

/** Ask once whether this deployment can sign in at all. */
export function useDeviceLoginAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(relayUrl('/auth/config'))
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (cancelled) return
        const ok =
          typeof body === 'object' && body !== null && (body as { deviceFlow?: unknown }).deviceFlow === true
        setAvailable(ok)
      })
      // A network failure and a 404 mean the same thing to the page: no login
      // here. Neither is worth an error message.
      .catch(() => !cancelled && setAvailable(false))
    return () => {
      cancelled = true
    }
  }, [])

  return available
}

export interface DeviceLogin {
  state: AuthState
  /** Begin. Safe to call again after a failure. */
  start: () => void
  /** Abandon an attempt in progress and return to idle. */
  cancel: () => void
}

/**
 * Run the flow, calling `onToken` once when it succeeds.
 *
 * The polling loop is a chain of timeouts rather than an interval, because the
 * gap between polls changes: GitHub can raise it mid-flow with `slow_down`, and
 * the last wait is shortened so expiry is reported at the moment it happens.
 */
export function useDeviceLogin(onToken: (credential: Credential) => void): DeviceLogin {
  const [state, setState] = useState<AuthState>({ status: 'idle' })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Bumped by cancel and by unmount, so a reply in flight is ignored. */
  const attempt = useRef(0)
  const token = useRef(onToken)
  token.current = onToken

  const stop = useCallback(() => {
    attempt.current += 1
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = undefined
  }, [])

  // A flow left running after the component goes away would keep polling
  // GitHub, and would call onToken into a tree that no longer exists.
  useEffect(() => stop, [stop])

  const start = useCallback(() => {
    stop()
    const mine = attempt.current
    setState({ status: 'starting' })

    void (async () => {
      let body: unknown
      try {
        body = await postJson('/auth/device/code', { scope: 'repo read:org' })
      } catch {
        if (attempt.current === mine) setState({ status: 'failed', reason: 'network' })
        return
      }
      if (attempt.current !== mine) return

      const code = readDeviceCode(body)
      if (code === null) {
        // The relay answers 404 with device_flow_unavailable where no GitHub
        // App is configured. Anything else unreadable is 'unknown' rather than
        // being reported as something specific we did not actually learn.
        const error = (body as { error?: unknown } | null)?.error
        setState({
          status: 'failed',
          reason: error === 'device_flow_unavailable' ? 'unsupported' : 'unknown',
        })
        return
      }

      let current: AuthState = {
        status: 'waiting',
        code,
        interval: code.interval,
        expiresAt: Date.now() + code.expiresIn * 1000,
      }
      setState(current)

      const poll = async () => {
        if (attempt.current !== mine) return
        let reply: unknown
        try {
          reply = await postJson('/auth/device/token', {
            device_code: code.deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          })
        } catch {
          if (attempt.current === mine) setState({ status: 'failed', reason: 'network' })
          return
        }
        if (attempt.current !== mine) return

        current = next(current, readPoll(reply), Date.now())
        setState(current)

        if (current.status === 'authenticated') {
          // The whole session, not just the token: an application configured to
          // expire its tokens hands back a refresh token here and nowhere else.
          const credential = credentialOf(current)
          if (credential) token.current(credential)
          return
        }
        const delay = delayUntilNextPoll(current, Date.now())
        if (delay === null) {
          if (current.status === 'waiting') setState({ status: 'failed', reason: 'expired' })
          return
        }
        timer.current = setTimeout(() => void poll(), delay)
      }

      const first = delayUntilNextPoll(current, Date.now())
      if (first !== null) timer.current = setTimeout(() => void poll(), first)
    })()
  }, [stop])

  const cancel = useCallback(() => {
    stop()
    setState({ status: 'idle' })
  }, [stop])

  return { state, start, cancel }
}

export { needsRefresh }

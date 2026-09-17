import { useCallback, useEffect, useRef, useState } from 'react'
import { afterRefresh, readPoll, refreshDelay, type Credential } from './deviceAuth'
import { loadCredential, loadStaySignedIn, saveCredential, saveStaySignedIn } from './storage'

/**
 * The signed-in session, kept alive.
 *
 * An OAuth App can be configured to expire its tokens, which hands back a
 * refresh token and an eight-hour lifetime. Without this, that configuration
 * looks like it works and then signs the user out mid-afternoon with a 401 they
 * cannot act on -- the worst kind of failure, because it arrives long after the
 * decision that caused it.
 *
 * A pasted token has neither a refresh token nor an expiry, so nothing here
 * runs for one. That is the same code path, not a special case.
 */
export interface Session {
  /** What every request uses. Empty when signed out. */
  token: string
  /** Begin a session, from a sign-in or from a pasted token. */
  signIn: (credential: Credential) => void
  signOut: () => void
  /**
   * Whether to keep the session on this device.
   *
   * Off by default, and off is the behaviour this app has always had: the token
   * lives in the tab and goes when the tab does. It is offered because the
   * default decides "this might be a shared machine" on everybody's behalf, and
   * most machines are not shared -- and because "new window" silently means two
   * different things. A window the page opens inherits the tab's session; one
   * the person opens does not, so the same app appears to remember them
   * sometimes and not others, with nothing visible to explain it.
   */
  stay: boolean
  setStay: (stay: boolean) => void
}

/** Where the relay lives; empty means same-origin. Mirrors useDeviceLogin. */
const RELAY = (import.meta.env.VITE_PR_RADAR_RELAY ?? '').replace(/\/$/, '')

export function useSession(): Session {
  const [credential, setCredential] = useState<Credential | null>(loadCredential)
  const [stay, setStay] = useState<boolean>(loadStaySignedIn)

  useEffect(() => {
    // Depends on `stay` as well as the credential, so turning the choice off
    // moves the session back out of localStorage rather than leaving a copy
    // behind. `saveCredential` clears whichever store it did not write.
    saveCredential(credential, stay)
  }, [credential, stay])

  useEffect(() => {
    saveStaySignedIn(stay)
  }, [stay])

  /*
   * The refresh in flight, so a re-render cannot start a second one.
   *
   * GitHub invalidates a refresh token the moment it is used, so two refreshes
   * racing means the loser's reply is a token minted from a credential that is
   * already dead -- and whichever lands last wins. One at a time is not an
   * optimisation here.
   */
  const running = useRef(false)

  const refresh = useCallback(async (current: Credential) => {
    if (running.current) return
    running.current = true
    try {
      const response = await fetch(`${RELAY}/auth/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: current.refreshToken,
        }),
      })
      const next = afterRefresh(current, readPoll(await response.json()), Date.now())
      /*
       * A failed refresh signs the user out rather than leaving them holding a
       * token that is about to stop working. Being asked to sign in is a thing
       * a person can act on; a dashboard that silently stops updating is not.
       */
      setCredential(next)
    } catch {
      setCredential(null)
    } finally {
      running.current = false
    }
  }, [])

  useEffect(() => {
    const delay = refreshDelay(credential, Date.now())
    if (delay === null || credential === null) return

    // setTimeout clamps above ~24.8 days, and a delay that large would fire
    // immediately instead of never. Nothing here reaches it -- eight hours is
    // the longest GitHub issues -- but a clamped timer fails silently, so the
    // bound is stated rather than assumed.
    const timer = setTimeout(() => void refresh(credential), Math.min(delay, 2_147_483_000))
    return () => clearTimeout(timer)
  }, [credential, refresh])

  return {
    token: credential?.token ?? '',
    signIn: setCredential,
    signOut: () => setCredential(null),
    stay,
    setStay,
  }
}

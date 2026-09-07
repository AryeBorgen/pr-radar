import { useCallback, useEffect, useState } from 'react'
import type { RepoRef } from '../types'
import { NOTIFY_RULES } from './notifications'

/**
 * Notifications that arrive with the tab closed.
 *
 * Only possible where something is awake to watch GitHub, which is
 * `pr-radar --push` or the container -- your own machine either way. The hosted
 * page has no server behind it, so `/push/config` answers 404 there and this
 * reports `available: false`; the panel then says nothing about push rather
 * than offering a switch that cannot work. That is the same shape `/auth/config`
 * uses for signing in.
 */

export interface PushState {
  /** Whether this deployment has a server that can watch on your behalf. */
  available: boolean
  /**
   * The server offers push, but this page cannot use it: a service worker needs
   * a secure context, and `http://<a LAN address>` is not one.
   *
   * Worth a state of its own because the failure is otherwise silent and deeply
   * confusing. `navigator.serviceWorker` is not merely restricted over plain
   * HTTP on a non-loopback host -- it is *absent*, measured -- so a phone
   * pointed at a laptop's address shows the dashboard, offers no push, and
   * explains nothing. Saying "this needs https" is the difference between a
   * missing feature and a broken one.
   */
  insecure: boolean
  /** The account that server polls as, so the panel can say if it differs. */
  serverViewer: string | null
  subscribed: boolean
  busy: boolean
  error: 'push.failed' | 'push.denied' | null
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/**
 * The application server key, as bytes.
 *
 * `subscribe()` takes a BufferSource. Some browsers also accept the base64url
 * string, and relying on that is how a subscription starts failing on the one
 * browser that does not -- so it is converted here, once.
 */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='))
  // Built over a real ArrayBuffer rather than with `Uint8Array.from`, which
  // produces `Uint8Array<ArrayBufferLike>` -- not a `BufferSource`, and so not
  // something `subscribe()` accepts.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index)
  return bytes
}

export function usePush(repos: RepoRef[], enabled: Record<string, boolean>, headlineFor: (id: string) => string): PushState {
  const [available, setAvailable] = useState(false)
  const [serverViewer, setServerViewer] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<PushState['error']>(null)
  const [insecure, setInsecure] = useState(false)

  const supported =
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Asked even where a service worker is impossible, because the answer
        // is what distinguishes "this deployment has no server" from "this
        // server has push and you have reached it the wrong way".
        const response = await fetch('push/config')
        if (!response.ok) return
        const config = (await response.json()) as { viewer: string | null }
        if (cancelled) return
        if (!supported) {
          setInsecure(true)
          return
        }
        setAvailable(true)
        setServerViewer(config.viewer)
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (!cancelled) setSubscribed(existing !== null)
      } catch {
        // No server behind this page, or it is not offering push. Either way
        // there is nothing to show, which is what `available: false` says.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supported])

  const enable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // Push requires permission to show notifications, and a browser will
      // refuse `subscribe()` outright without it rather than asking on our
      // behalf.
      if (Notification.permission !== 'granted') {
        const answer = await Notification.requestPermission()
        if (answer !== 'granted') {
          setError('push.denied')
          return
        }
      }

      const config = (await (await fetch('push/config')).json()) as { key: string }
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Required, and honest: every push this sends results in something
          // visible. A silent push would be refused by the browser anyway.
          userVisibleOnly: true,
          applicationServerKey: keyBytes(config.key),
        }))

      const response = await fetch('push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          repos,
          enabled,
          /*
           * The words, not the keys. The server has no catalogue and translates
           * nothing -- giving a daemon a second copy of the message catalogue is
           * exactly what this project keeps refusing to do -- so whichever
           * language this page is in is the language the notification arrives
           * in.
           */
          headlines: Object.fromEntries(NOTIFY_RULES.map((rule) => [rule.id, headlineFor(rule.id)])),
        }),
      })
      if (!response.ok) throw new Error('subscribe failed')
      setSubscribed(true)
    } catch {
      setError('push.failed')
    } finally {
      setBusy(false)
    }
  }, [repos, enabled, headlineFor])

  const disable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        // Told first, then dropped: unsubscribing locally while the server
        // still holds the endpoint would leave it ringing an address nobody is
        // listening to until the push service finally answers 410.
        await fetch('push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        await subscription.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      setError('push.failed')
    } finally {
      setBusy(false)
    }
  }, [])

  return { available, insecure, serverViewer, subscribed, busy, error, enable, disable }
}

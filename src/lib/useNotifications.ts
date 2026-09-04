import { useEffect, useRef } from 'react'
import type { PullRequest } from '../types'
import type { NotifyState } from './notifications'
import { EMPTY_NOTIFY_STATE, evaluate, waitingCount } from './notifications'

const STATE_KEY = 'pr-radar.notify.v1'

function loadState(): NotifyState {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return EMPTY_NOTIFY_STATE
    const parsed = JSON.parse(raw) as Partial<NotifyState>
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((k) => typeof k === 'string') : [],
      matched: typeof parsed.matched === 'object' && parsed.matched ? parsed.matched : {},
    }
  } catch {
    return EMPTY_NOTIFY_STATE
  }
}

function saveState(state: NotifyState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state))
  } catch {
    // Losing the baseline costs one quiet cycle, not correctness.
  }
}

export function permissionOf(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/**
 * Fire a desktop notification per transition, and keep the tab title showing how
 * many pull requests are waiting on this user — which works whether or not
 * notification permission was ever granted.
 */
export function useNotifications(
  prs: PullRequest[],
  viewer: string,
  enabled: Record<string, boolean>,
  active: boolean,
): void {
  const state = useRef<NotifyState | null>(null)

  useEffect(() => {
    if (!viewer) return
    if (state.current === null) state.current = loadState()

    const { fires, next } = evaluate(prs, enabled, state.current, { viewer })
    state.current = next
    saveState(next)

    const waiting = waitingCount(prs, { viewer })
    document.title = waiting > 0 ? `(${waiting}) PR Radar` : 'PR Radar'

    if (!active || permissionOf() !== 'granted') return

    for (const { rule, pr } of fires) {
      const notification = new Notification(`${rule.headline} · ${pr.repo}`, {
        body: pr.title,
        // Collapses repeat announcements for the same PR and rule instead of
        // stacking them if the tab has been open a long time.
        tag: `${rule.id}:${pr.repo}#${pr.number}`,
        // Left out when there is no avatar rather than set to undefined; the
        // browser treats an absent icon and an undefined one differently.
        ...(pr.author?.avatarUrl ? { icon: pr.author.avatarUrl } : {}),
      })
      notification.onclick = () => {
        window.open(pr.url, '_blank', 'noreferrer')
        notification.close()
      }
    }
  }, [prs, viewer, enabled, active])
}

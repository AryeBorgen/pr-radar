/**
 * Watching GitHub while the tab is closed.
 *
 * This is the part that genuinely cannot be done from a page: a browser stops
 * running when you close it, so something else has to be awake and holding a
 * token. That cost is why none of it happens without `--push`.
 *
 * ## The doorbell
 *
 * A push message carries no payload. It wakes the service worker, which asks
 * this server what happened and shows the notification itself.
 *
 * That is the better design twice over, not a shortcut. Sending content would
 * mean implementing RFC 8291 -- ECDH and AES-GCM by hand -- which is the most
 * dangerous code in the feature and the least interesting. And it would put
 * pull request titles through Google's and Mozilla's push services, which have
 * no business seeing them. So the only thing that leaves this machine is
 * "something happened".
 *
 * ## Who supplies the words
 *
 * Rule headlines are translation keys and the catalogue lives in the browser.
 * Rather than give a daemon a second copy of it -- the thing this project keeps
 * refusing to do, for the reason `bin/relay-policy.js` exists -- the page sends
 * the words it wants when it subscribes, and this echoes them back with a
 * repository and a number attached.
 */
import { fetchEnrichment as realEnrichment, fetchPullRequests as realPullRequests } from '../lib/github'
import { EMPTY_NOTIFY_STATE, evaluate } from '../lib/notifications'
import type { Enrichment, PullRequest, RepoRef } from '../types'
import { loadState, saveState, type ServerState, type Subscription } from './state'
import { generateVapidKeys, publicKeyForBrowser, pushHeaders } from './vapid'

/** Long enough that a poll costs little, short enough to be worth having. */
export const DEFAULT_INTERVAL_MS = 120_000

/** A push service saying this is gone is telling the truth; stop ringing it. */
const GONE = new Set([404, 410])

/** Identifies a subscription without putting the endpoint in every log line. */
export function endpointKey(endpoint: string): string {
  return endpoint.slice(-24)
}

/** What a woken service worker is handed. */
export interface PendingNotification {
  title: string
  body: string
  url: string
  tag: string
}

export interface PollResult {
  skipped?: boolean
  repos?: number
  pullRequests?: number
  rung?: number
}

export interface NotifierOptions {
  dir: string
  token: string
  /** How a push service reaches whoever is sending. Must be mailto: or https:. */
  subject?: string
  intervalMs?: number
  log?: Pick<Console, 'log' | 'error'>
  /** Injected in tests: a poll that neither talks to GitHub nor waits. */
  fetchPullRequests?: typeof realPullRequests
  fetchEnrichment?: typeof realEnrichment
  fetchImpl?: typeof fetch
}

export interface Notifier {
  readonly vapidPublicKey: string
  readonly subscriptionCount: number
  readonly viewer: string | null
  setViewer(login: string): void
  subscribe(subscription: Subscription): Subscription
  unsubscribe(endpoint: string): boolean
  collect(endpoint: string): PendingNotification[]
  poll(): Promise<PollResult>
  start(): void
  stop(): void
}

export function createNotifier({
  dir,
  token,
  subject = 'https://github.com/AryeBorgen/pr-radar',
  intervalMs = DEFAULT_INTERVAL_MS,
  log = console,
  fetchPullRequests = realPullRequests,
  fetchEnrichment = realEnrichment,
  fetchImpl = fetch,
}: NotifierOptions): Notifier {
  const state: ServerState = loadState(dir)
  let timer: ReturnType<typeof setInterval> | null = null
  let polling = false

  /*
   * Review and check state, keyed by head SHA -- the same key the browser uses
   * and for the same reason. A push invalidates it, so a poll that finds
   * nothing new costs one request per repository and nothing per pull request.
   * In memory rather than on disk: it describes a commit, and re-reading it
   * after a restart is cheap and cannot be stale.
   */
  const enrichment = new Map<string, Enrichment>()

  /** Notifications waiting for a service worker to come and collect them. */
  const pending = new Map<string, PendingNotification[]>()

  if (!state.vapid) {
    state.vapid = generateVapidKeys()
    saveState(dir, state)
  }

  const persist = () => saveState(dir, state)

  /** The union of what every subscribed browser asked to watch. */
  function watchedRepos(): RepoRef[] {
    const seen = new Map<string, RepoRef>()
    for (const sub of state.subscriptions) {
      for (const repo of sub.repos ?? []) seen.set(`${repo.owner}/${repo.name}`, repo)
    }
    return [...seen.values()]
  }

  async function enrich(pr: PullRequest): Promise<PullRequest> {
    const cached = enrichment.get(pr.headSha)
    if (cached) return { ...pr, ...cached }
    const fresh = await fetchEnrichment(token, pr)
    enrichment.set(pr.headSha, fresh)
    return { ...pr, ...fresh }
  }

  /**
   * Ring one browser.
   *
   * A failure is never fatal: a push service being briefly unavailable is not a
   * reason to stop watching GitHub. A 404 or 410 is different -- that
   * subscription is gone for good, and keeping it would mean failing forever.
   */
  async function ring(endpoint: string): Promise<boolean> {
    if (!state.vapid) return false
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: pushHeaders({ endpoint, subject, keys: state.vapid }),
      })
      if (GONE.has(response.status)) {
        state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== endpoint)
        pending.delete(endpoint)
        persist()
        log.log(`pr-radar: push subscription ${endpointKey(endpoint)} is gone; forgotten`)
        return false
      }
      if (!response.ok) {
        log.error(`pr-radar: push to ${endpointKey(endpoint)} failed with ${response.status}`)
        return false
      }
      return true
    } catch (error) {
      log.error(`pr-radar: could not reach the push service: ${(error as Error).message}`)
      return false
    }
  }

  /**
   * One round: read GitHub, decide what changed, ring whoever cares.
   *
   * Each subscription is evaluated against its own baseline, so a phone
   * watching one set of repositories is not told about a laptop's -- and both
   * are served by one set of requests rather than one set each.
   */
  async function poll(): Promise<PollResult> {
    if (polling) return { skipped: true }
    const repos = watchedRepos()
    if (repos.length === 0) return { skipped: true }

    polling = true
    try {
      const { pullRequests, errors } = await fetchPullRequests(token, repos)
      for (const failure of errors ?? []) {
        log.error(`pr-radar: ${failure.repo ?? 'a repository'}: ${failure.message}`)
      }

      const enriched = await Promise.all(pullRequests.map(enrich))
      const viewer = state.viewer ?? ''
      let rung = 0

      for (const sub of [...state.subscriptions]) {
        const wanted = new Set((sub.repos ?? []).map((r) => `${r.owner}/${r.name}`))
        const mine = enriched.filter((pr) => wanted.has(pr.repo))
        const key = endpointKey(sub.endpoint)

        const { fires, next } = evaluate(mine, sub.enabled ?? {}, state.notified[key] ?? EMPTY_NOTIFY_STATE, {
          viewer,
        })
        state.notified[key] = next

        if (fires.length === 0) continue

        const queue = pending.get(sub.endpoint) ?? []
        for (const { rule, pr } of fires) {
          queue.push({
            // The words came from the browser; only the reference is ours.
            title: `${sub.headlines?.[rule.id] ?? rule.id} · ${pr.repo}`,
            body: pr.title,
            url: pr.url,
            tag: `${pr.repo}#${pr.number}`,
          })
        }
        pending.set(sub.endpoint, queue)
        if (await ring(sub.endpoint)) rung += 1
      }

      persist()
      return { repos: repos.length, pullRequests: enriched.length, rung }
    } finally {
      polling = false
    }
  }

  return {
    get vapidPublicKey() {
      return publicKeyForBrowser(state.vapid!.publicKey)
    },
    get subscriptionCount() {
      return state.subscriptions.length
    },
    get viewer() {
      return state.viewer ?? null
    },
    setViewer(login) {
      state.viewer = login
      persist()
    },

    subscribe(subscription) {
      const index = state.subscriptions.findIndex((s) => s.endpoint === subscription.endpoint)
      if (index === -1) state.subscriptions.push(subscription)
      else state.subscriptions[index] = subscription
      persist()
      return subscription
    },

    unsubscribe(endpoint) {
      const before = state.subscriptions.length
      state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== endpoint)
      pending.delete(endpoint)
      delete state.notified[endpointKey(endpoint)]
      persist()
      return state.subscriptions.length !== before
    },

    /** What a woken service worker should show, handed over exactly once. */
    collect(endpoint) {
      const queue = pending.get(endpoint) ?? []
      pending.delete(endpoint)
      return queue
    },

    poll,

    start() {
      if (timer) return
      // `unref` so the notifier never keeps the process alive by itself: the
      // server is what holds it open, and Ctrl-C should end both.
      timer = setInterval(() => {
        poll().catch((error: Error) => log.error(`pr-radar: poll failed: ${error.message}`))
      }, intervalMs)
      timer.unref?.()
    },

    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
  }
}

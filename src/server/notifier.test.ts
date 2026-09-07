// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { PullRequest } from '../types'
import { createNotifier, type Notifier } from './notifier'
import type { Subscription } from './state'

/**
 * The notifier, driven through a whole round.
 *
 * GitHub and the push service are replaced, but the part that decides *whether
 * to interrupt somebody* is the real `evaluate` from `src/lib` -- which is the
 * whole reason the notifier imports it instead of re-deriving it. A test
 * against a stub of that would prove nothing about what a person receives.
 *
 * The push service is a function that records what arrived, so "no payload is
 * sent" is checked by looking at the request rather than at the code that
 * builds it.
 */

const VIEWER = 'octocat'
const ENDPOINT = 'https://push.example.com/subscription/aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = 'https://push.example.com/subscription/bbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function pull(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: `id-${overrides.number ?? 1}`,
    number: 1,
    title: 'Add a keyboard shortcut',
    url: 'https://github.com/acme/web/pull/1',
    repo: 'acme/web',
    state: 'OPEN',
    mergedAt: null,
    closedAt: null,
    headSha: 'sha-1',
    isDraft: false,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
    author: { login: VIEWER, avatarUrl: '' },
    labels: [],
    assignees: [],
    requestedReviewers: [],
    reviewedBy: [],
    // Settled by default. An UNKNOWN never fires, deliberately, and forgetting
    // that would look like the notifier was broken.
    reviewDecision: 'NONE',
    checkState: 'SUCCESS',
    ...overrides,
  }
}

const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pr-radar-notifier-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

/** What the fake push service saw, in order. */
let rung: { url: string; method?: string | undefined; headers: Record<string, string>; body?: unknown }[] = []
/** What it answers next. */
let pushStatus = 201

const fakePush = ((url: string, init: RequestInit) => {
  rung.push({
    url,
    method: init.method,
    headers: init.headers as Record<string, string>,
    body: init.body,
  })
  return Promise.resolve({ ok: pushStatus < 400, status: pushStatus } as Response)
}) as unknown as typeof fetch

function notifierOver(prs: PullRequest[], dir = scratch()) {
  let current = prs
  const notifier = createNotifier({
    dir,
    token: 'ghp_test',
    fetchImpl: fakePush,
    log: { log() {}, error() {} } as unknown as Console,
    fetchPullRequests: async () => ({ pullRequests: current, errors: [], truncated: [] }),
    fetchEnrichment: async (_token, pr) => ({
      reviewedBy: pr.reviewedBy,
      reviewDecision: pr.reviewDecision,
      checkState: pr.checkState,
    }),
  })
  notifier.setViewer(VIEWER)
  return { notifier, dir, set: (next: PullRequest[]) => { current = next } }
}

const ALL_RULES = {
  'review-requested': true,
  approved: true,
  'changes-requested': true,
  'ci-failed': true,
}

function subscribeTo(
  notifier: Notifier,
  endpoint = ENDPOINT,
  repos = [{ owner: 'acme', name: 'web' }],
): Subscription {
  return notifier.subscribe({
    endpoint,
    repos,
    enabled: ALL_RULES,
    headlines: { 'ci-failed': 'CI failed', 'review-requested': 'Review requested' },
  })
}

/** The same pull request after a commit that broke the build. */
const broken = () => [pull({ checkState: 'FAILURE', headSha: 'sha-1-b' })]

beforeEach(() => {
  rung = []
  pushStatus = 201
})

describe('the first poll', () => {
  it('rings nobody, however much already matches', async () => {
    /*
     * Inherited from the browser: the first evaluation establishes a baseline.
     * Otherwise turning push on would immediately announce every pull request
     * that was already failing, none of which just happened.
     */
    const { notifier } = notifierOver([pull({ checkState: 'FAILURE' })])
    subscribeTo(notifier)

    expect((await notifier.poll()).rung).toBe(0)
    expect(rung).toEqual([])
  })

  it('does not ask GitHub anything when nobody has subscribed', async () => {
    // What makes the notifier free until somebody asks for it.
    let asked = 0
    const notifier = createNotifier({
      dir: scratch(),
      token: 'ghp_test',
      fetchImpl: fakePush,
      log: { log() {}, error() {} } as unknown as Console,
      fetchPullRequests: async () => {
        asked += 1
        return { pullRequests: [], errors: [], truncated: [] }
      },
      fetchEnrichment: async () => ({ reviewedBy: [], reviewDecision: 'NONE', checkState: 'NONE' }),
    })

    expect(await notifier.poll()).toEqual({ skipped: true })
    expect(asked).toBe(0)
  })
})

describe('a change after the baseline', () => {
  it("rings once, and says what happened in the browser's own words", async () => {
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())

    expect((await notifier.poll()).rung).toBe(1)

    const [waiting] = notifier.collect(ENDPOINT)
    expect(waiting?.title).toBe('CI failed · acme/web')
    expect(waiting?.body).toBe('Add a keyboard shortcut')
    expect(waiting?.tag).toBe('acme/web#1')
  })

  it('sends a doorbell: no body, no content encoding', async () => {
    /*
     * The property that lets this project skip RFC 8291, checked on the request
     * rather than in the code that builds it. A `Content-Encoding` here would
     * promise an encrypted body that is not being sent.
     */
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())

    await notifier.poll()

    expect(rung[0]?.method).toBe('POST')
    expect(rung[0]?.body).toBeUndefined()
    expect(rung[0]?.headers['Content-Length']).toBe('0')
    expect(rung[0]?.headers['Content-Encoding']).toBeUndefined()
    expect(rung[0]?.headers.Authorization).toMatch(/^vapid t=.+, k=.+$/)
  })

  it('hands the queue over exactly once', async () => {
    // A later wake-up with nothing new must not repeat the last notification.
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())
    await notifier.poll()

    expect(notifier.collect(ENDPOINT)).toHaveLength(1)
    expect(notifier.collect(ENDPOINT)).toEqual([])
  })

  it('does not ring again while nothing changes', async () => {
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())
    await notifier.poll()

    await notifier.poll()
    await notifier.poll()

    expect(rung).toHaveLength(1)
  })
})

describe('two browsers', () => {
  it("do not announce each other's repositories", async () => {
    /*
     * One set of requests serves both, but each keeps its own baseline -- so a
     * phone watching acme/web is not told about something in acme/api that a
     * laptop asked about.
     */
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier, ENDPOINT, [{ owner: 'acme', name: 'web' }])
    subscribeTo(notifier, OTHER, [{ owner: 'acme', name: 'api' }])
    await notifier.poll()
    set(broken())

    await notifier.poll()

    expect(rung.map((r) => r.url)).toEqual([ENDPOINT])
    expect(notifier.collect(OTHER)).toEqual([])
  })
})

describe('a subscription that has gone', () => {
  it('is forgotten when the push service says 410', async () => {
    // Keeping it would mean failing forever, every poll, for a browser that no
    // longer exists.
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())
    pushStatus = 410

    await notifier.poll()

    expect(notifier.subscriptionCount).toBe(0)
  })

  it('is kept when the push service is merely unavailable', async () => {
    // A 503 is weather, not a decision. Dropping it would mean a brief outage
    // silently turns push off for good.
    const { notifier, set } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()
    set(broken())
    pushStatus = 503

    await notifier.poll()

    expect(notifier.subscriptionCount).toBe(1)
  })
})

describe('across a restart', () => {
  it('carries its baseline, so a change during downtime is still announced', async () => {
    /*
     * Written the other way round first, and it proved nothing: "a restart
     * announces nothing" passes whether or not the baseline is persisted,
     * because a notifier with no state announces nothing on its first poll
     * either. Both paths are silent, so silence cannot tell them apart.
     *
     * What distinguishes them is a change that happens *while the server is
     * down*. With the baseline on disk the restarted notifier knows this pull
     * request was fine before and rings; without it, the failure is simply what
     * it finds first and nobody is ever told.
     */
    const { notifier, dir } = notifierOver([pull()])
    subscribeTo(notifier)
    await notifier.poll()

    const restarted = notifierOver(broken(), dir).notifier
    await restarted.poll()

    expect(rung).toHaveLength(1)
    expect(restarted.collect(ENDPOINT)[0]?.title).toBe('CI failed · acme/web')
  })
})

import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchMergeability, mergePullRequest, setPullRequestState } from './github'
import { failureFor, optimistic, type ActionKind, type MergeMethod, type Mergeability } from './actions'
import type { MessageKey } from '../i18n/en'
import type { PullRequest } from '../types'

/**
 * Doing the thing, and putting it back if GitHub says no.
 *
 * The rules about *whether* an action is allowed are in actions.ts and are
 * pure. This is the part that talks to GitHub and to the cache: one mutation,
 * one pull request at a time.
 *
 * There is deliberately no bulk action. Selecting eleven rows and merging them
 * is a feature that reads well in a changelog and goes wrong once, expensively.
 */

export interface ActionOutcome {
  kind: ActionKind
  pr: PullRequest
  /** Set when it failed; absent when it worked. */
  error?: MessageKey
}

export interface PrActions {
  /** The pull request currently being acted on, by id. */
  busy: string | null
  /** The most recent outcome, for the banner. Cleared by `dismiss`. */
  outcome: ActionOutcome | null
  dismiss: () => void
  merge: (pr: PullRequest, method: MergeMethod) => void
  close: (pr: PullRequest) => void
  reopen: (pr: PullRequest) => void
  /** Ask GitHub about one pull request's mergeability. Cached per head SHA. */
  mergeability: (pr: PullRequest) => Mergeability | undefined
  loadMergeability: (pr: PullRequest) => void
}

/**
 * The query key the list is cached under, so an optimistic edit can find it.
 *
 * It has to match usePrRadar's first key segment exactly. A typo here would
 * make every optimistic update silently do nothing, and the only symptom would
 * be a row that takes until the next poll to change -- which reads as
 * slowness rather than as a bug. Asserted in usePrActions.test.ts.
 */
export const LIST_KEY = 'pull-requests'

export function usePrActions(token: string): PrActions {
  const client = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null)
  /*
   * Keyed by head SHA, like the enrichment cache and for the same reason: it
   * describes a commit, so a push should invalidate it. Keying by pull request
   * number would keep telling somebody a branch is mergeable after the push
   * that made it conflict.
   */
  const [known, setKnown] = useState<Record<string, Mergeability>>({})

  /** Replace one pull request everywhere the list is cached. */
  const patch = useCallback(
    (id: string, next: PullRequest | null) => {
      client.setQueriesData<{ pullRequests: PullRequest[] }>(
        { queryKey: [LIST_KEY] },
        (data) => {
          if (!data) return data
          return {
            ...data,
            pullRequests: data.pullRequests.map((item) =>
              item.id === id ? (next ?? item) : item,
            ),
          }
        },
      )
    },
    [client],
  )

  const run = useMutation({
    mutationFn: async ({
      pr,
      kind,
      method,
    }: {
      pr: PullRequest
      kind: ActionKind
      method?: MergeMethod
    }) => {
      const [owner, name] = pr.repo.split('/')
      if (!owner || !name) throw new Error('action.failed.unknown')
      if (kind === 'merge') {
        // The head SHA goes with the merge: it is what makes GitHub answer 409
        // if the branch moved while the menu was open, rather than quietly
        // landing a commit nobody in front of the screen has seen.
        await mergePullRequest(token, pr.repo, pr.number, method ?? 'merge', pr.headSha)
      } else {
        await setPullRequestState(token, pr.repo, pr.number, kind === 'close' ? 'closed' : 'open')
      }
    },
    onMutate: ({ pr, kind }) => {
      setBusy(pr.id)
      setOutcome(null)
      // Optimistic, so the row moves at once. A list that waits for the next
      // poll makes a person click twice, and clicking merge twice is the thing
      // this module exists to prevent.
      const before = pr
      patch(pr.id, optimistic(pr, kind, Date.now()))
      return { before }
    },
    onError: (error, { pr, kind }, context) => {
      // Put it back exactly as it was. An optimistic update that survives a
      // failure is a lie the user will act on.
      if (context?.before) patch(pr.id, context.before)
      const status = (error as { status?: number }).status
      setOutcome({ kind, pr, error: failureFor(status) })
    },
    onSuccess: (_data, { pr, kind }) => {
      setOutcome({ kind, pr })
      // GitHub is the truth. The optimistic row is close enough to look right
      // immediately; this is what makes it actually right.
      void client.invalidateQueries({ queryKey: [LIST_KEY] })
    },
    onSettled: () => setBusy(null),
  })

  const loadMergeability = useCallback(
    (pr: PullRequest) => {
      if (known[pr.headSha] !== undefined) return
      void fetchMergeability(token, pr.repo, pr.number)
        .then((info) => setKnown((was) => ({ ...was, [pr.headSha]: info })))
        // A failure here costs a more cautious menu, not an error: the actions
        // stay available and GitHub gets the final word when one is used.
        .catch(() => undefined)
    },
    [known, token],
  )

  return {
    busy,
    outcome,
    dismiss: () => setOutcome(null),
    merge: (pr, method) => run.mutate({ pr, kind: 'merge', method }),
    close: (pr) => run.mutate({ pr, kind: 'close' }),
    reopen: (pr) => run.mutate({ pr, kind: 'reopen' }),
    mergeability: (pr) => known[pr.headSha],
    loadMergeability,
  }
}

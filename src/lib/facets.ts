import type { PullRequest } from '../types'
import type { MessageKey } from '../i18n/en'
import { applyStages } from './filter'

/**
 * The one-click filters, as three independent axes.
 *
 * They are independent on purpose: "my PRs" and "changes requested" are
 * different questions, and the useful view is their intersection. A single row
 * of mutually exclusive tabs cannot express that, so each axis holds its own
 * selection and the axes are ANDed together.
 *
 * Every option is still just a query string, so a combination the axes cannot
 * express can be typed into the filter box and saved as a view.
 */
export interface FacetOption {
  id: string
  /*
   * A key, not a label. These are data, and data that carries English is data
   * a Hebrew reader sees in English -- with nothing anywhere reporting it,
   * because a string in a module is invisible to a check that reads components.
   * Typed as MessageKey, so a key that does not exist is a compile error.
   */
  label: MessageKey
  query: string
}

export interface Facet {
  id: string
  /** Shown before the options; keep it to one word where possible. */
  legend: MessageKey
  options: FacetOption[]
}

export const FACETS: Facet[] = [
  {
    id: 'status',
    legend: 'axis.status',
    options: [
      { id: 'open', label: 'axis.status.open', query: 'is:open' },
      /*
       * Merge history is most useful newest-first, so the option carries its own
       * sort. Because a later stage wins, the Sort menu can still override it.
       */
      { id: 'merged', label: 'axis.status.merged', query: 'is:merged sort:merged-desc' },
      { id: 'closed', label: 'axis.status.closed', query: 'is:closed' },
      { id: 'all', label: 'axis.status.all', query: '' },
    ],
  },
  {
    id: 'involvement',
    legend: 'axis.who',
    options: [
      { id: 'anyone', label: 'axis.who.anyone', query: '' },
      { id: 'mine', label: 'axis.who.mine', query: 'author:@me' },
      { id: 'to-review', label: 'axis.who.toReview', query: 'review-requested:@me' },
      { id: 'reviewed', label: 'axis.who.reviewed', query: 'reviewed-by:@me' },
      { id: 'involves', label: 'axis.who.involves', query: 'involves:@me' },
    ],
  },
  {
    id: 'state',
    legend: 'axis.state',
    options: [
      { id: 'any', label: 'axis.state.any', query: '' },
      /*
       * Awaiting review excludes `unknown` rather than treating it as awaiting:
       * a PR whose review state has not been fetched yet is not known to be
       * waiting on anyone, and counting it would overstate the queue while the
       * second pass is still running.
       */
      {
        id: 'awaiting',
        label: 'axis.state.awaiting',
        query: '-review:approved -review:changes-requested -review:unknown',
      },
      { id: 'approved', label: 'axis.state.approved', query: 'review:approved' },
      { id: 'changes', label: 'axis.state.changes', query: 'review:changes-requested' },
      { id: 'ci-red', label: 'axis.state.ciRed', query: 'checks:failure' },
      { id: 'stale', label: 'axis.state.stale', query: 'updated:<7d' },
    ],
  },
  {
    id: 'draft',
    legend: 'axis.drafts',
    options: [
      /*
       * Drafts are shown by default, and that is a deliberate default rather
       * than an oversight: a review bot that moves a PR back to draft on a
       * failed review makes "draft" a state worth seeing, not noise to hide.
       */
      { id: 'all', label: 'axis.drafts.shown', query: '' },
      { id: 'only', label: 'axis.drafts.only', query: 'is:draft' },
      { id: 'hide', label: 'axis.drafts.hidden', query: '-is:draft' },
    ],
  },
]

export type Selection = Record<string, string>

export const DEFAULT_SELECTION: Selection = Object.fromEntries(
  // Every facet above declares at least one option; the fallback is what tells
  // the compiler so, rather than a claim that one might be empty.
  FACETS.map((facet) => [facet.id, facet.options[0]?.id ?? '']),
)

/**
 * Whether the current selection needs closed pull requests fetched.
 *
 * Anything but the default Open view does, and this drives the request rather
 * than only the filter — a closed PR cannot be filtered into view if it was
 * never loaded.
 */
export function needsClosed(selection: Selection): boolean {
  return selection.status !== 'open'
}

function optionQuery(facet: Facet, selection: Selection): string {
  const chosen = facet.options.find((option) => option.id === selection[facet.id])
  return chosen?.query ?? ''
}

export function combine(...queries: string[]): string {
  return queries.filter((query) => query.trim()).join(' ')
}

/** One filter stage per axis. Each narrows the previous rather than joining it. */
export function selectionStages(selection: Selection): string[] {
  return FACETS.map((facet) => optionQuery(facet, selection))
}

/** Human-readable form of the whole selection, for saving as a view. */
export function selectionQuery(selection: Selection, text: string): string {
  return combine(...selectionStages(selection), text)
}

/**
 * Count for one option, measured against every *other* axis.
 *
 * Holding the other axes fixed is what makes the numbers worth reading: with
 * "Mine" selected, the Approved count answers "how many of mine are approved",
 * which is the question being asked, rather than restating a global total.
 */
export function facetCounts(
  prs: PullRequest[],
  facet: Facet,
  selection: Selection,
  stages: string[],
  viewer: string,
  now: number,
): Record<string, number> {
  const others = FACETS.filter((other) => other.id !== facet.id).map((other) =>
    optionQuery(other, selection),
  )

  return Object.fromEntries(
    facet.options.map((option) => [
      option.id,
      applyStages(prs, [...others, ...stages, option.query], { viewer, now }).length,
    ]),
  )
}

import type { PullRequest } from '../types'
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
  label: string
  query: string
}

export interface Facet {
  id: string
  /** Shown before the options; keep it to one word where possible. */
  legend: string
  options: FacetOption[]
}

export const FACETS: Facet[] = [
  {
    id: 'status',
    legend: 'Status',
    options: [
      { id: 'open', label: 'Open', query: 'is:open' },
      /*
       * Merge history is most useful newest-first, so the option carries its own
       * sort. Because a later stage wins, the Sort menu can still override it.
       */
      { id: 'merged', label: 'Merged', query: 'is:merged sort:merged-desc' },
      { id: 'closed', label: 'Closed unmerged', query: 'is:closed' },
      { id: 'all', label: 'All', query: '' },
    ],
  },
  {
    id: 'involvement',
    legend: 'Who',
    options: [
      { id: 'anyone', label: 'Anyone', query: '' },
      { id: 'mine', label: 'Mine', query: 'author:@me' },
      { id: 'to-review', label: 'To review', query: 'review-requested:@me' },
      { id: 'reviewed', label: 'I reviewed', query: 'reviewed-by:@me' },
      { id: 'involves', label: 'Involves me', query: 'involves:@me' },
    ],
  },
  {
    id: 'state',
    legend: 'State',
    options: [
      { id: 'any', label: 'Any', query: '' },
      /*
       * Awaiting review excludes `unknown` rather than treating it as awaiting:
       * a PR whose review state has not been fetched yet is not known to be
       * waiting on anyone, and counting it would overstate the queue while the
       * second pass is still running.
       */
      {
        id: 'awaiting',
        label: 'Awaiting review',
        query: '-review:approved -review:changes-requested -review:unknown',
      },
      { id: 'approved', label: 'Approved', query: 'review:approved' },
      { id: 'changes', label: 'Changes requested', query: 'review:changes-requested' },
      { id: 'ci-red', label: 'CI failing', query: 'checks:failure' },
      { id: 'stale', label: 'Stale 7d+', query: 'updated:<7d' },
    ],
  },
  {
    id: 'draft',
    legend: 'Drafts',
    options: [
      /*
       * Drafts are shown by default, and that is a deliberate default rather
       * than an oversight: a review bot that moves a PR back to draft on a
       * failed review makes "draft" a state worth seeing, not noise to hide.
       */
      { id: 'all', label: 'Shown', query: '' },
      { id: 'only', label: 'Only', query: 'is:draft' },
      { id: 'hide', label: 'Hidden', query: '-is:draft' },
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

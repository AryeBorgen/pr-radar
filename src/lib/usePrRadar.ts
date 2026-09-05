import { useMemo, useState, useReducer, useRef } from 'react'
import { fraction } from './progress'
import { useQuery } from '@tanstack/react-query'
import { fetchPullRequests, fetchViewer, type RepoFailure } from './github'
import { useEnrichment } from './useEnrichment'
import { applyStages, parseQuery } from './filter'
import { repoKey } from './storage'
import type { PullRequest, RepoRef, SavedView } from '../types'
import type { Selection } from './facets'
import { DEFAULT_SELECTION, needsClosed, selectionQuery, selectionStages } from './facets'
import type { MenuOption, MenuSelection } from './menus'
import { DEFAULT_PERIOD, menuOptions, menuStages } from './menus'

/**
 * Everything the dashboard needs, given a token and a list of repositories.
 *
 * It takes those as arguments and stores nothing. That is the whole reason the
 * hook exists separately from the application: the standalone page keeps a token
 * in sessionStorage and settings in localStorage, and a radar embedded in
 * somebody else's application must do neither -- a host has its own idea of who
 * the user is, and a component that writes to storage behind its back is a
 * component that cannot be trusted in a page you did not write.
 */
export interface PrRadarInput {
  token: string
  repos: RepoRef[]
  /** Saved views to count against the current list. Counting only; nothing is stored. */
  views?: SavedView[]
  /** Seconds between background refetches. 0 disables polling. */
  refreshInterval?: number
}

export interface PrRadarState {
  /** Every pull request fetched, enriched where enrichment has arrived. */
  pullRequests: PullRequest[]
  /** Those that survive the current filters, in the current sort order. */
  visible: PullRequest[]
  /** The login the token belongs to; '' until it is known. */
  viewer: string
  /** Pinned to each fetch, so ages and `updated:<7d` agree and do not drift. */
  now: number

  selection: Selection
  setSelection: (selection: Selection) => void
  menus: MenuSelection
  setMenus: (menus: MenuSelection) => void
  sort: string
  setSort: (sort: string) => void
  period: string
  setPeriod: (period: string) => void
  search: string
  setSearch: (search: string) => void

  /** Options for the dropdowns, narrowed by every filter except the menus. */
  menuOptionsFor: Record<string, MenuOption[]>
  /** Stages from everything except the axes, which the facet counts measure against. */
  nonAxisStages: string[]
  /** The current filter as one query string, for saving as a view. */
  combined: string
  /** Qualifiers in the search box this application does not understand. */
  unknown: string[]
  /** How many pull requests each saved view would show. */
  viewCounts: Record<string, number>

  withClosed: boolean
  isPending: boolean
  isFetching: boolean
  /** How many pull requests are still waiting for review and check state. */
  enriching: number
  /**
   * How far a load has got, 0 to 1, or null when there is nothing to report.
   *
   * Null covers both "not started" and "finished", which are the same thing to
   * anything that draws a bar. See lib/progress.ts for why the two phases are
   * weighted rather than halved.
   */
  progress: number | null
  error: Error | null
  /** Repositories whose closed list was cut off by the page size. */
  truncated: string[]
  /** Repositories that failed on their own, reported by name. */
  failures: RepoFailure[]
  refetch: () => void

  /** Reset the axes and put a saved view's query in the box. */
  applyView: (view: SavedView) => void
}

export function usePrRadar({
  token,
  repos,
  views = [],
  refreshInterval = 120,
}: PrRadarInput): PrRadarState {
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION)
  const [menus, setMenus] = useState<MenuSelection>({})
  const [sort, setSort] = useState('')
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [search, setSearch] = useState('')

  // Repos are the query key, so adding or removing one refetches immediately.
  const repoIds = repos.map(repoKey).sort().join(',')

  const viewerQuery = useQuery({
    queryKey: ['viewer', token],
    queryFn: () => fetchViewer(token),
    enabled: Boolean(token),
    staleTime: Infinity,
  })

  // Closed PRs are part of the key: switching the Status axis refetches.
  const withClosed = needsClosed(selection)

  /*
   * How many repositories have answered, for the loading bar.
   *
   * A ref alongside the state: the fetch reports progress from inside a promise
   * that outlives a render, and writing straight to state from there would
   * queue an update per repository. The ref is the truth; the state exists to
   * make the bar re-render, and both move together.
   */
  const listProgress = useRef({ done: 0, total: 0 })
  const [, bumpProgress] = useReducer((n: number) => n + 1, 0)

  const query = useQuery({
    queryKey: ['pull-requests', repoIds, withClosed],
    queryFn: () => {
      listProgress.current = { done: 0, total: repos.length }
      bumpProgress()
      return fetchPullRequests(token, repos, withClosed, (done, total) => {
        listProgress.current = { done, total }
        bumpProgress()
      })
    },
    enabled: Boolean(token) && repos.length > 0,
    refetchInterval: refreshInterval > 0 ? refreshInterval * 1000 : false,
  })

  const { prs, pending, total: enrichTotal } = useEnrichment(token, query.data?.pullRequests)
  const viewer = viewerQuery.data ?? ''

  const now = useMemo(() => Date.now(), [query.dataUpdatedAt])

  /*
   * Every filter source contributes its own stage rather than being merged into
   * one query string: stages narrow each other, while a single string would OR
   * repeated qualifiers and make "Mine" plus an author from the menu widen the
   * result instead of intersecting it.
   */
  const nonAxisStages = useMemo(
    () => [...menuStages(menus, sort, period, withClosed), search],
    [menus, sort, period, withClosed, search],
  )
  const allStages = useMemo(
    () => [...selectionStages(selection), ...nonAxisStages],
    [selection, nonAxisStages],
  )

  const visible = useMemo(
    () => applyStages(prs, allStages, { viewer, now }),
    [prs, allStages, viewer, now],
  )

  /*
   * Menu options come from the list narrowed by everything except the menus, so
   * a choice that would lead nowhere is not offered in the first place.
   */
  const menuOptionsFor = useMemo(
    () =>
      menuOptions(
        applyStages(
          prs,
          [...selectionStages(selection), menuStages({}, '', period, withClosed).join(' '), search],
          { viewer, now },
        ),
      ),
    [prs, selection, period, withClosed, search, viewer, now],
  )

  const combined = useMemo(
    () =>
      selectionQuery(
        selection,
        [...menuStages(menus, sort, period, withClosed), search].filter(Boolean).join(' '),
      ),
    [selection, menus, sort, period, withClosed, search],
  )

  const viewCounts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const view of views) {
      result[view.id] = applyStages(prs, [view.query], { viewer, now }).length
    }
    return result
  }, [prs, views, viewer, now])

  const unknown = useMemo(() => parseQuery(search).unknown, [search])

  /*
   * Applying a view resets the axes and puts its query in the box, so what runs
   * is exactly the string that was saved -- a view never half-merges with an
   * axis selection left over from before.
   */
  const applyView = (view: SavedView) => {
    setSelection(DEFAULT_SELECTION)
    setMenus({})
    setSort('')
    setPeriod(DEFAULT_PERIOD)
    setSearch(view.query)
  }

  return {
    pullRequests: prs,
    visible,
    viewer,
    now,
    selection,
    setSelection,
    menus,
    setMenus,
    sort,
    setSort,
    period,
    setPeriod,
    search,
    setSearch,
    menuOptionsFor,
    nonAxisStages,
    combined,
    unknown,
    viewCounts,
    withClosed,
    isPending: query.isPending,
    isFetching: query.isFetching,
    enriching: pending,
    progress: fraction({
      reposDone: listProgress.current.done,
      reposTotal: listProgress.current.total,
      enrichedDone: enrichTotal - pending,
      enrichedTotal: enrichTotal,
    }),
    error: query.error instanceof Error ? query.error : null,
    truncated: query.data?.truncated ?? [],
    failures: query.data?.errors ?? [],
    refetch: () => void query.refetch(),
    applyView,
  }
}

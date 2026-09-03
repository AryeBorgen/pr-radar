import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPullRequests, fetchViewer } from './lib/github'
import { useEnrichment } from './lib/useEnrichment'
import { applyStages, parseQuery } from './lib/filter'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  loadToken,
  repoKey,
  saveSettings,
  saveToken,
} from './lib/storage'
import type { RepoRef, SavedView, Settings } from './types'
import type { Selection } from './lib/facets'
import { DEFAULT_SELECTION, needsClosed, selectionQuery, selectionStages } from './lib/facets'
import type { MenuSelection } from './lib/menus'
import { DEFAULT_PERIOD, menuOptions, menuStages } from './lib/menus'
import { DEFAULT_NOTIFY_ENABLED } from './lib/notifications'
import { useNotifications } from './lib/useNotifications'
import FacetBar from './components/FacetBar'
import FilterMenus from './components/FilterMenus'
import SavedViews from './components/SavedViews'
import FilterBar from './components/FilterBar'
import PrRow from './components/PrRow'
import NotifyMenu from './components/NotifyMenu'
import RepoManager from './components/RepoManager'
import TokenGate from './components/TokenGate'

export default function App() {
  const [token, setToken] = useState(loadToken)
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : loadSettings(),
  )
  const [selection, setSelection] = useState<Selection>(DEFAULT_SELECTION)
  const [menus, setMenus] = useState<MenuSelection>({})
  const [sort, setSort] = useState('')
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [search, setSearch] = useState('')
  const [showRepos, setShowRepos] = useState(false)
  const [notify, setNotify] = useState<Record<string, boolean>>(DEFAULT_NOTIFY_ENABLED)

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveToken(token), [token])

  // Repos are the query key, so adding or removing one refetches immediately.
  const repoIds = settings.repos.map(repoKey).sort().join(',')

  const viewerQuery = useQuery({
    queryKey: ['viewer', token],
    queryFn: () => fetchViewer(token),
    enabled: Boolean(token),
    staleTime: Infinity,
  })

  // Closed PRs are part of the key: switching the Status axis refetches.
  const withClosed = needsClosed(selection)

  const query = useQuery({
    queryKey: ['pull-requests', repoIds, withClosed],
    queryFn: () => fetchPullRequests(token, settings.repos, withClosed),
    enabled: Boolean(token) && settings.repos.length > 0,
    refetchInterval: settings.refreshInterval > 0 ? settings.refreshInterval * 1000 : false,
  })

  const { prs, pending } = useEnrichment(token, query.data?.pullRequests)
  const viewer = viewerQuery.data ?? ''

  // Watches the whole fetched list, not the filtered view: a notification you
  // only get when the right tab is selected is not a notification.
  useNotifications(prs, viewer, notify, settings.repos.length > 0)

  /*
   * `now` is pinned to each fetch rather than read per render, so relative ages
   * and any `updated:<7d` filter agree with each other and do not drift as the
   * page sits open.
   */
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
  const optionsFor = useMemo(
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
    for (const view of settings.views) {
      result[view.id] = applyStages(prs, [view.query], { viewer, now }).length
    }
    return result
  }, [prs, settings.views, viewer, now])

  const unknown = useMemo(() => parseQuery(search).unknown, [search])

  const setRepos = (repos: RepoRef[]) => setSettings((prev) => ({ ...prev, repos }))
  const setViews = (views: SavedView[]) => setSettings((prev) => ({ ...prev, views }))

  /*
   * Applying a view resets the axes and puts its query in the box, so what runs
   * is exactly the string that was saved — a view never half-merges with an
   * axis selection left over from before.
   */
  const applyView = (view: SavedView) => {
    setSelection(DEFAULT_SELECTION)
    setMenus({})
    setSort('')
    setPeriod(DEFAULT_PERIOD)
    setSearch(view.query)
  }

  if (!token) return <TokenGate onToken={setToken} />

  const noRepos = settings.repos.length === 0

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h1 className="font-semibold">PR Radar</h1>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {settings.repos.length} {settings.repos.length === 1 ? 'repository' : 'repositories'}
          {viewer && ` · ${viewer}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRepos((open) => !open)}
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {showRepos ? 'Done' : 'Repositories'}
          </button>
          <NotifyMenu enabled={notify} onChange={setNotify} />
          <button
            type="button"
            onClick={() => setToken('')}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Sign out
          </button>
        </div>
      </header>

      {(showRepos || noRepos) && (
        <RepoManager token={token} repos={settings.repos} onChange={setRepos} />
      )}

      {!noRepos && (
        <>
          <FacetBar
            prs={prs}
            selection={selection}
            stages={nonAxisStages}
            viewer={viewer}
            now={now}
            onChange={setSelection}
          />
          <FilterMenus
            options={optionsFor}
            selection={menus}
            sort={sort}
            period={period}
            showPeriod={withClosed}
            onChange={setMenus}
            onSortChange={setSort}
            onPeriodChange={setPeriod}
          />
          <SavedViews
            views={settings.views}
            counts={viewCounts}
            onApply={applyView}
            onChange={setViews}
            draftQuery={combined}
          />
          <FilterBar
            value={search}
            onChange={setSearch}
            unknown={unknown}
            shown={visible.length}
            total={prs.length}
            fetching={query.isFetching}
            pending={pending}
            onRefresh={() => query.refetch()}
          />
        </>
      )}

      {query.error && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {query.error instanceof Error ? query.error.message : 'Could not reach GitHub.'}
        </p>
      )}

      {withClosed && (query.data?.truncated.length ?? 0) > 0 && (
        <p className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          Showing the 100 most recently updated closed pull requests per repository, so older
          ones in this period may be missing from{' '}
          <strong className="font-medium">{query.data?.truncated.join(', ')}</strong>. Narrow the
          period, or filter to one repository, to see further back.
        </p>
      )}

      {/* A repo that failed on its own alias must not look like it has no PRs. */}
      {query.data?.errors.map((failure) => (
        <p
          key={`${failure.repo}-${failure.message}`}
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400"
        >
          {failure.repo ? <strong className="font-medium">{failure.repo}: </strong> : null}
          {failure.message}
        </p>
      ))}

      {noRepos ? (
        <p className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Add a repository above to get started.
        </p>
      ) : query.isPending ? (
        <p className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Loading pull requests…
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {prs.length === 0
            ? 'No open pull requests in these repositories.'
            : 'No pull requests match this filter.'}
        </p>
      ) : (
        <ul>
          {visible.map((pr) => (
            <PrRow key={pr.id} pr={pr} now={now} />
          ))}
        </ul>
      )}
    </div>
  )
}

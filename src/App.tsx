import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchPullRequests } from './lib/github'
import { applyQuery, parseQuery } from './lib/filter'
import {
  DEFAULT_SETTINGS,
  loadSettings,
  loadToken,
  repoKey,
  saveSettings,
  saveToken,
} from './lib/storage'
import type { Bucket, RepoRef, Settings } from './types'
import BucketTabs from './components/BucketTabs'
import FilterBar from './components/FilterBar'
import PrRow from './components/PrRow'
import RepoManager from './components/RepoManager'
import TokenGate from './components/TokenGate'

export default function App() {
  const [token, setToken] = useState(loadToken)
  const [settings, setSettings] = useState<Settings>(() =>
    typeof localStorage === 'undefined' ? DEFAULT_SETTINGS : loadSettings(),
  )
  const [activeBucket, setActiveBucket] = useState(() => settings.buckets[0]?.id ?? '')
  const [search, setSearch] = useState('')
  const [showRepos, setShowRepos] = useState(false)

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveToken(token), [token])

  // Repos are the query key, so adding or removing one refetches immediately.
  const repoIds = settings.repos.map(repoKey).sort().join(',')

  const query = useQuery({
    queryKey: ['pull-requests', repoIds],
    queryFn: () => fetchPullRequests(token, settings.repos),
    enabled: Boolean(token) && settings.repos.length > 0,
    refetchInterval: settings.refreshInterval > 0 ? settings.refreshInterval * 1000 : false,
  })

  const prs = query.data?.pullRequests ?? []
  const viewer = query.data?.viewer ?? ''

  /*
   * `now` is pinned to each fetch rather than read per render, so relative ages
   * and any `updated:<7d` filter agree with each other and do not drift as the
   * page sits open.
   */
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt])

  const bucket = settings.buckets.find((b) => b.id === activeBucket) ?? settings.buckets[0]
  const combined = [bucket?.query ?? '', search].filter(Boolean).join(' ')

  const visible = useMemo(
    () => applyQuery(prs, combined, { viewer, now }),
    [prs, combined, viewer, now],
  )

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const item of settings.buckets) {
      result[item.id] = applyQuery(prs, item.query, { viewer, now }).length
    }
    return result
  }, [prs, settings.buckets, viewer, now])

  const unknown = useMemo(() => parseQuery(combined).unknown, [combined])

  const setRepos = (repos: RepoRef[]) => setSettings((prev) => ({ ...prev, repos }))
  const setBuckets = (buckets: Bucket[]) => setSettings((prev) => ({ ...prev, buckets }))

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
          <BucketTabs
            buckets={settings.buckets}
            counts={counts}
            activeId={bucket?.id ?? ''}
            onSelect={setActiveBucket}
            onChange={setBuckets}
            draftQuery={combined}
          />
          <FilterBar
            value={search}
            onChange={setSearch}
            unknown={unknown}
            shown={visible.length}
            total={prs.length}
            fetching={query.isFetching}
            onRefresh={() => query.refetch()}
          />
        </>
      )}

      {query.error && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {query.error instanceof Error ? query.error.message : 'Could not reach GitHub.'}
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

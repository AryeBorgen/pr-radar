import type { SavedView } from '../types'
// Pulled in so the library build emits the stylesheet; the host imports it
// explicitly, since injecting <style> into someone else's page is not ours to do.
import '../index.css'
import type { PrRadarState } from '../lib/usePrRadar'
import FacetBar from './FacetBar'
import FilterMenus from './FilterMenus'
import SavedViews from './SavedViews'
import FilterBar from './FilterBar'
import PrRow from './PrRow'

/**
 * The dashboard itself: the filters, the messages and the list.
 *
 * Everything around it -- the token screen, the repository manager, the header
 * with its sign-out button -- belongs to the standalone application and stays
 * there. This is the part a host embeds, and a host has its own header and its
 * own idea of who is signed in.
 */
export interface RadarProps {
  radar: PrRadarState
  /**
   * Saved views, when the caller has somewhere to keep them. The standalone
   * application stores them in localStorage; a host may not want to, and the
   * section is simply absent rather than storing them on its behalf.
   */
  views?: SavedView[]
  onViewsChange?: (views: SavedView[]) => void
}

const NOTE = 'pr:border-b pr:border-neutral-200 pr:bg-neutral-50 pr:px-4 pr:py-2 pr:text-sm pr:text-neutral-600 pr:dark:border-neutral-800 pr:dark:bg-neutral-900 pr:dark:text-neutral-400'
const EMPTY = 'pr:px-4 pr:py-12 pr:text-center pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-400'

export default function Radar({ radar, views, onViewsChange }: RadarProps) {
  return (
    <>
      <FacetBar
        prs={radar.pullRequests}
        selection={radar.selection}
        stages={radar.nonAxisStages}
        viewer={radar.viewer}
        now={radar.now}
        onChange={radar.setSelection}
      />
      <FilterMenus
        options={radar.menuOptionsFor}
        selection={radar.menus}
        sort={radar.sort}
        period={radar.period}
        showPeriod={radar.withClosed}
        onChange={radar.setMenus}
        onSortChange={radar.setSort}
        onPeriodChange={radar.setPeriod}
      />
      {views && onViewsChange && (
        <SavedViews
          views={views}
          counts={radar.viewCounts}
          onApply={radar.applyView}
          onChange={onViewsChange}
          draftQuery={radar.combined}
        />
      )}
      <FilterBar
        value={radar.search}
        onChange={radar.setSearch}
        unknown={radar.unknown}
        shown={radar.visible.length}
        total={radar.pullRequests.length}
        fetching={radar.isFetching}
        pending={radar.enriching}
        onRefresh={radar.refetch}
      />

      {radar.error && (
        <p className="pr:border-b pr:border-red-200 pr:bg-red-50 pr:px-4 pr:py-3 pr:text-sm pr:text-red-700 pr:dark:border-red-900 pr:dark:bg-red-950 pr:dark:text-red-400">
          {radar.error.message}
        </p>
      )}

      {radar.withClosed && radar.truncated.length > 0 && (
        <p className={NOTE}>
          Showing the 100 most recently updated closed pull requests per repository, so older ones
          in this period may be missing from{' '}
          <strong className="pr:font-medium">{radar.truncated.join(', ')}</strong>. Narrow the period,
          or filter to one repository, to see further back.
        </p>
      )}

      {/* A repo that failed on its own must not look like it has no PRs. */}
      {radar.failures.map((failure) => (
        <p
          key={`${failure.repo}-${failure.message}`}
          className="pr:border-b pr:border-amber-200 pr:bg-amber-50 pr:px-4 pr:py-2 pr:text-sm pr:text-amber-800 pr:dark:border-amber-900 pr:dark:bg-amber-950 pr:dark:text-amber-400"
        >
          {failure.repo ? <strong className="pr:font-medium">{failure.repo}: </strong> : null}
          {failure.message}
        </p>
      ))}

      {radar.isPending ? (
        <p className={EMPTY}>Loading pull requests…</p>
      ) : radar.visible.length === 0 ? (
        <p className={EMPTY}>
          {radar.pullRequests.length === 0
            ? 'No open pull requests in these repositories.'
            : 'No pull requests match this filter.'}
        </p>
      ) : (
        <ul>
          {radar.visible.map((pr) => (
            <PrRow key={pr.id} pr={pr} now={radar.now} />
          ))}
        </ul>
      )}
    </>
  )
}

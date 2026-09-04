import type { SavedView } from '../types'
import { reference } from '../lib/actions'
import { messageFor, messageForKey } from '../i18n/errors'
import { useT } from '../i18n/useLocale'
// Pulled in so the library build emits the stylesheet; the host imports it
// explicitly, since injecting <style> into someone else's page is not ours to do.
import '../index.css'
import { useLocale } from '../i18n/useLocale'
import type { PrRadarState } from '../lib/usePrRadar'
import type { PrActions } from '../lib/usePrActions'
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
  /**
   * Merging and closing, when the caller wants them.
   *
   * Absent by default, and absent is the safe default: a panel embedded in
   * somebody else's application listing pull requests is a different
   * proposition from one that can merge branches. The host opts in.
   */
  actions?: PrActions
}

const NOTE = 'pr:border-b pr:border-neutral-200 pr:bg-neutral-50 pr:px-4 pr:py-2 pr:text-sm pr:text-neutral-600 pr:dark:border-neutral-800 pr:dark:bg-neutral-900 pr:dark:text-neutral-400'
const EMPTY = 'pr:px-4 pr:py-12 pr:text-center pr:text-sm pr:text-neutral-500 pr:dark:text-neutral-400'

export default function Radar({ radar, views, onViewsChange, actions }: RadarProps) {
  const t = useT()
  const { dir } = useLocale()
  return (
    // `dir` lives here, not on <html>: embedded, the document belongs to the
    // host, and flipping their whole page because a panel is Hebrew would
    // re-lay-out an application nobody asked us to touch. Standalone, the
    // provider sets <html dir> as well and this agrees with it.
    <div dir={dir} className="pr:contents">
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
          {messageFor(t, radar.error, 'error.status')}
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

      {/*
        What happened, said once and dismissible.
        A failed merge must never be silent: the row was updated optimistically
        and then put back, and a row that changes and changes back with no
        explanation is worse than one that never moved.
      */}
      {actions?.outcome && (
        <p
          role="status"
          className={
            actions.outcome.error
              ? 'pr:flex pr:items-center pr:gap-3 pr:border-b pr:border-red-200 pr:bg-red-50 pr:px-4 pr:py-2 pr:text-sm pr:text-red-800 pr:dark:border-red-900 pr:dark:bg-red-950 pr:dark:text-red-300'
              : 'pr:flex pr:items-center pr:gap-3 pr:border-b pr:border-emerald-200 pr:bg-emerald-50 pr:px-4 pr:py-2 pr:text-sm pr:text-emerald-800 pr:dark:border-emerald-900 pr:dark:bg-emerald-950 pr:dark:text-emerald-300'
          }
        >
          <span>
            {actions.outcome.error
              ? t(actions.outcome.error)
              : t(
                  actions.outcome.kind === 'merge'
                    ? 'action.merged'
                    : actions.outcome.kind === 'close'
                      ? 'action.closed'
                      : 'action.reopened',
                  { pr: reference(actions.outcome.pr) },
                )}
          </span>
          <button
            type="button"
            onClick={actions.dismiss}
            className="pr:ms-auto pr:text-xs pr:underline"
          >
            {t('action.cancel')}
          </button>
        </p>
      )}

      {/* A repo that failed on its own must not look like it has no PRs. */}
      {radar.failures.map((failure) => (
        <p
          key={`${failure.repo}-${failure.message}`}
          className="pr:border-b pr:border-amber-200 pr:bg-amber-50 pr:px-4 pr:py-2 pr:text-sm pr:text-amber-800 pr:dark:border-amber-900 pr:dark:bg-amber-950 pr:dark:text-amber-400"
        >
          {failure.repo ? <strong className="pr:font-medium">{failure.repo}: </strong> : null}
          {messageForKey(t, failure.message, failure.values, 'error.requestFailed')}
        </p>
      ))}

      {radar.isPending ? (
        <p className={EMPTY}>{t('radar.loading')}</p>
      ) : radar.visible.length === 0 ? (
        <p className={EMPTY}>
          {radar.pullRequests.length === 0
            ? t('radar.noneOpen')
            : t('radar.noMatch')}
        </p>
      ) : (
        <ul>
          {radar.visible.map((pr) => (
            <PrRow key={pr.id} pr={pr} now={radar.now} {...(actions ? { actions } : {})} />
          ))}
        </ul>
      )}
    </div>
  )
}

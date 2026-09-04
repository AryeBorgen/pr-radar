import type { PullRequest } from '../types'
import { useT } from '../i18n/useLocale'
import type { Selection } from '../lib/facets'
import { FACETS, facetCounts } from '../lib/facets'

interface Props {
  prs: PullRequest[]
  selection: Selection
  /** Filter stages from every source other than the axes. */
  stages: string[]
  viewer: string
  now: number
  onChange: (selection: Selection) => void
}

export default function FacetBar({ prs, selection, stages, viewer, now, onChange }: Props) {
  const t = useT()
  return (
    <div className="pr:border-b pr:border-neutral-200 pr:dark:border-neutral-800">
      {FACETS.map((facet) => {
        const counts = facetCounts(prs, facet, selection, stages, viewer, now)
        return (
          <div key={facet.id} className="pr:flex pr:flex-wrap pr:items-center pr:gap-1.5 pr:px-4 pr:py-1.5">
            <span className="pr:w-14 pr:shrink-0 pr:text-xs pr:font-medium pr:tracking-wide pr:text-neutral-400 pr:uppercase pr:dark:text-neutral-500">
              {t(facet.legend)}
            </span>
            {facet.options.map((option) => {
              const active = selection[facet.id] === option.id
              const count = counts[option.id] ?? 0
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onChange({ ...selection, [facet.id]: option.id })}
                  aria-pressed={active}
                  title={option.query || t('facet.noFilter')}
                  className={`pr:flex pr:items-center pr:gap-1.5 pr:rounded-full pr:px-3 pr:py-1 pr:text-sm pr:transition-colors ${
                    active
                      ? 'bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : count === 0
                        ? 'text-neutral-400 hover:bg-neutral-100 dark:text-neutral-600 dark:hover:bg-neutral-800'
                        : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  {t(option.label)}
                  <span
                    className={`pr:rounded-full pr:px-1.5 pr:text-xs pr:tabular-nums ${
                      active
                        ? 'bg-white/20 dark:bg-neutral-900/15'
                        : 'bg-neutral-100 dark:bg-neutral-800'
                    } ${count === 0 ? 'opacity-50' : ''}`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

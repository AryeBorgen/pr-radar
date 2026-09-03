import type { PullRequest } from '../types'
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
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      {FACETS.map((facet) => {
        const counts = facetCounts(prs, facet, selection, stages, viewer, now)
        return (
          <div key={facet.id} className="flex flex-wrap items-center gap-1.5 px-4 py-1.5">
            <span className="w-14 shrink-0 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
              {facet.legend}
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
                  title={option.query || 'No filter on this axis'}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                    active
                      ? 'bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : count === 0
                        ? 'text-neutral-400 hover:bg-neutral-100 dark:text-neutral-600 dark:hover:bg-neutral-800'
                        : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  {option.label}
                  <span
                    className={`rounded-full px-1.5 text-xs tabular-nums ${
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

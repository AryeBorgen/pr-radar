import type { PullRequest } from '../types'
import { useSlots } from './slots'
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
  const { Button } = useSlots()
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
                  <Button
                    key={option.id}
                    variant="pill"
                    selected={active}
                    onClick={() => onChange({ ...selection, [facet.id]: option.id })}
                    title={option.query || t('facet.noFilter')}
                  >
                    {t(option.label)}
                    <span
                      className={`pr:ms-1.5 pr:rounded-full pr:px-1.5 pr:text-xs pr:tabular-nums ${
                        active
                          ? 'pr:bg-white/20 pr:dark:bg-neutral-900/15'
                          : 'pr:bg-neutral-100 pr:dark:bg-neutral-800'
                      } ${count === 0 ? 'pr:opacity-50' : ''}`}
                    >
                      {count}
                    </span>
                  </Button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

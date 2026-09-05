import { useState, type ReactNode } from 'react'
import { activeAxes } from '../lib/facets'
import type { Selection } from '../lib/facets'
import { useSlots } from './slots'
import { useT } from '../i18n/useLocale'

/**
 * Everything that filters, behind one control on a phone.
 *
 * Measured before it existed: the axes, the menus and the saved views took 715
 * of an 844-pixel screen, so 85% of a phone was spent before the first pull
 * request appeared. A dashboard you have to scroll past to reach the list is
 * not a dashboard.
 *
 * One control rather than three, because collapsing each band separately gives
 * a phone three buttons that each hide a third of the answer. And a panel
 * rather than a scrolling strip: the menus open downward from their triggers,
 * and `overflow-x` creates a clipping context that would cut those off.
 *
 * Above `sm` this renders its children and nothing else — the desktop layout is
 * untouched, which is what the measurement says it should be.
 */
export default function FilterPanel({
  selection,
  children,
}: {
  /** Only to summarise what is filtering; this component changes nothing. */
  selection: Selection
  children: ReactNode
}) {
  const { Button } = useSlots()
  const t = useT()
  const [open, setOpen] = useState(false)
  const active = activeAxes(selection)

  return (
    <>
      {/*
        The summary names what is filtering rather than counting it: "Mine" is
        useful where "2 filters" is not, and with the axes hidden this is the
        only place that state is visible at all.
      */}
      <div className="pr:flex pr:items-center pr:gap-2 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-2 pr:sm:hidden pr:dark:border-neutral-800">
        <Button
          variant="default"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-controls="filter-panel"
        >
          {t('facet.filters')}
          {active.length > 0 && (
            <span className="pr:ms-1.5 pr:rounded-full pr:bg-neutral-900 pr:px-1.5 pr:text-xs pr:text-white pr:dark:bg-neutral-100 pr:dark:text-neutral-900">
              {active.length}
            </span>
          )}
        </Button>
        <span
          data-testid="filter-summary"
          className="pr:min-w-0 pr:flex-1 pr:truncate pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400"
        >
          {active.length === 0
            ? t('facet.noneActive')
            : active.map(({ option }) => t(option.label)).join(' · ')}
        </span>
      </div>

      <div id="filter-panel" className={open ? '' : 'pr:hidden pr:sm:block'}>
        {children}
      </div>
    </>
  )
}

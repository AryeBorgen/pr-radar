import { useEffect, useRef, useState } from 'react'
import type { MenuOption, MenuSelection } from '../lib/menus'
import { MENUS, PERIOD_OPTIONS, SORT_OPTIONS, toggle } from '../lib/menus'

interface Props {
  options: Record<string, MenuOption[]>
  selection: MenuSelection
  sort: string
  period: string
  /** The period only means anything once closed PRs are in scope. */
  showPeriod: boolean
  onChange: (selection: MenuSelection) => void
  onSortChange: (sort: string) => void
  onPeriodChange: (period: string) => void
}

/** Show the search box only once scanning the list stops being practical. */
const SEARCH_THRESHOLD = 8

function Dropdown({
  label,
  active,
  children,
}: {
  label: string
  active: number
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // A menu should close on an outside click and on Escape, like GitHub's.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={container} className="pr:relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className={`pr:flex pr:items-center pr:gap-1 pr:rounded-md pr:px-2.5 pr:py-1 pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800 ${
          active > 0
            ? 'font-medium text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-600 dark:text-neutral-400'
        }`}
      >
        {label}
        {active > 0 && (
          <span className="pr:rounded-full pr:bg-neutral-900 pr:px-1.5 pr:text-xs pr:text-white pr:tabular-nums pr:dark:bg-neutral-100 pr:dark:text-neutral-900">
            {active}
          </span>
        )}
        <span aria-hidden="true" className="pr:text-[10px]">
          ▾
        </span>
      </button>

      {open && (
        <div className="pr:absolute pr:right-0 pr:z-20 pr:mt-1 pr:w-72 pr:overflow-hidden pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:shadow-lg pr:dark:border-neutral-700 pr:dark:bg-neutral-900">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export default function FilterMenus({
  options,
  selection,
  sort,
  period,
  showPeriod,
  onChange,
  onSortChange,
  onPeriodChange,
}: Props) {
  const [search, setSearch] = useState<Record<string, string>>({})

  return (
    <div className="pr:flex pr:flex-wrap pr:items-center pr:justify-end pr:gap-1 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-1.5 pr:dark:border-neutral-800">
      {MENUS.map((menu) => {
        const all = options[menu.id] ?? []
        const chosen = selection[menu.id] ?? []
        const term = (search[menu.id] ?? '').toLowerCase()
        const shown = term
          ? all.filter((option) => option.label.toLowerCase().includes(term))
          : all

        return (
          <Dropdown key={menu.id} label={menu.label} active={chosen.length}>
            {() => (
              <>
                <div className="pr:flex pr:items-center pr:justify-between pr:border-b pr:border-neutral-200 pr:px-3 pr:py-2 pr:dark:border-neutral-700">
                  <span className="pr:text-sm pr:font-semibold">Filter by {menu.label.toLowerCase()}</span>
                  {chosen.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...selection, [menu.id]: [] })}
                      className="pr:text-xs pr:text-blue-600 pr:dark:text-blue-400"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {menu.searchable && all.length >= SEARCH_THRESHOLD && (
                  <div className="pr:border-b pr:border-neutral-200 pr:p-2 pr:dark:border-neutral-700">
                    <input
                      autoFocus
                      value={search[menu.id] ?? ''}
                      onChange={(event) =>
                        setSearch({ ...search, [menu.id]: event.target.value })
                      }
                      placeholder={`Filter ${menu.label.toLowerCase()}`}
                      aria-label={`Search ${menu.label.toLowerCase()}`}
                      className="pr:w-full pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-2 pr:py-1 pr:text-sm pr:outline-none pr:focus:border-blue-500 pr:dark:border-neutral-600 pr:dark:bg-neutral-950"
                    />
                  </div>
                )}

                <ul className="pr:max-h-72 pr:overflow-y-auto pr:py-1">
                  {shown.length === 0 && (
                    <li className="pr:px-3 pr:py-2 pr:text-sm pr:text-neutral-500">
                      Nothing here matches the current filters.
                    </li>
                  )}
                  {shown.map((option) => {
                    const on = chosen.some(
                      (value) => value.toLowerCase() === option.value.toLowerCase(),
                    )
                    return (
                      <li key={option.value}>
                        <button
                          type="button"
                          onClick={() =>
                            onChange({
                              ...selection,
                              [menu.id]: toggle(chosen, option.value, menu.multiple),
                            })
                          }
                          className="pr:flex pr:w-full pr:items-center pr:gap-2 pr:px-3 pr:py-1.5 pr:text-left pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800"
                        >
                          <span className="pr:w-3 pr:shrink-0 pr:text-blue-600 pr:dark:text-blue-400">
                            {on ? '✓' : ''}
                          </span>
                          {option.avatarUrl ? (
                            <img
                              src={option.avatarUrl}
                              alt=""
                              width={18}
                              height={18}
                              className="pr:rounded-full"
                            />
                          ) : null}
                          {option.color && (
                            <span
                              aria-hidden="true"
                              className="pr:h-3 pr:w-3 pr:shrink-0 pr:rounded-full"
                              style={{ backgroundColor: `#${option.color}` }}
                            />
                          )}
                          <span className="pr:truncate">{option.label}</span>
                          <span className="pr:ml-auto pr:shrink-0 pr:text-xs pr:text-neutral-400 pr:tabular-nums">
                            {option.count}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Dropdown>
        )
      })}

      {showPeriod && (
        <Dropdown
          label={PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? 'Period'}
          active={0}
        >
          {(close) => (
            <ul className="pr:py-1">
              {PERIOD_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onPeriodChange(option.value)
                      close()
                    }}
                    className="pr:flex pr:w-full pr:items-center pr:gap-2 pr:px-3 pr:py-1.5 pr:text-left pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800"
                  >
                    <span className="pr:w-3 pr:shrink-0 pr:text-blue-600 pr:dark:text-blue-400">
                      {period === option.value ? '✓' : ''}
                    </span>
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dropdown>
      )}

      <Dropdown label="Sort" active={0}>
        {(close) => (
          <ul className="pr:py-1">
            {SORT_OPTIONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    onSortChange(option.value)
                    close()
                  }}
                  className="pr:flex pr:w-full pr:items-center pr:gap-2 pr:px-3 pr:py-1.5 pr:text-left pr:text-sm pr:hover:bg-neutral-100 pr:dark:hover:bg-neutral-800"
                >
                  <span className="pr:w-3 pr:shrink-0 pr:text-blue-600 pr:dark:text-blue-400">
                    {sort === option.value ? '✓' : ''}
                  </span>
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dropdown>
    </div>
  )
}

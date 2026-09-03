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
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
          active > 0
            ? 'font-medium text-neutral-900 dark:text-neutral-100'
            : 'text-neutral-600 dark:text-neutral-400'
        }`}
      >
        {label}
        {active > 0 && (
          <span className="rounded-full bg-neutral-900 px-1.5 text-xs text-white tabular-nums dark:bg-neutral-100 dark:text-neutral-900">
            {active}
          </span>
        )}
        <span aria-hidden="true" className="text-[10px]">
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
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
    <div className="flex flex-wrap items-center justify-end gap-1 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800">
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
                <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
                  <span className="text-sm font-semibold">Filter by {menu.label.toLowerCase()}</span>
                  {chosen.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange({ ...selection, [menu.id]: [] })}
                      className="text-xs text-blue-600 dark:text-blue-400"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {menu.searchable && all.length >= SEARCH_THRESHOLD && (
                  <div className="border-b border-neutral-200 p-2 dark:border-neutral-700">
                    <input
                      autoFocus
                      value={search[menu.id] ?? ''}
                      onChange={(event) =>
                        setSearch({ ...search, [menu.id]: event.target.value })
                      }
                      placeholder={`Filter ${menu.label.toLowerCase()}`}
                      aria-label={`Search ${menu.label.toLowerCase()}`}
                      className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:border-neutral-600 dark:bg-neutral-950"
                    />
                  </div>
                )}

                <ul className="max-h-72 overflow-y-auto py-1">
                  {shown.length === 0 && (
                    <li className="px-3 py-2 text-sm text-neutral-500">
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
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                        >
                          <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
                            {on ? '✓' : ''}
                          </span>
                          {option.avatarUrl ? (
                            <img
                              src={option.avatarUrl}
                              alt=""
                              width={18}
                              height={18}
                              className="rounded-full"
                            />
                          ) : null}
                          {option.color && (
                            <span
                              aria-hidden="true"
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: `#${option.color}` }}
                            />
                          )}
                          <span className="truncate">{option.label}</span>
                          <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">
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
            <ul className="py-1">
              {PERIOD_OPTIONS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onPeriodChange(option.value)
                      close()
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
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
          <ul className="py-1">
            {SORT_OPTIONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    onSortChange(option.value)
                    close()
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <span className="w-3 shrink-0 text-blue-600 dark:text-blue-400">
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

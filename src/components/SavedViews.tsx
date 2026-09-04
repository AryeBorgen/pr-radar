import { useState } from 'react'
import type { SavedView } from '../types'

interface Props {
  views: SavedView[]
  counts: Record<string, number>
  onApply: (view: SavedView) => void
  onChange: (views: SavedView[]) => void
  /** The query the axes and filter box currently add up to. */
  draftQuery: string
}

/**
 * Saved views exist for the combinations the axes cannot express — two authors,
 * a specific label, one repository. A view is stored as the query string it came
 * from, so applying one is the same operation as typing it.
 */
export default function SavedViews({ views, counts, onApply, onChange, draftQuery }: Props) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onChange([...views, { id: `view-${Date.now().toString(36)}`, name: trimmed, query: draftQuery }])
    setName('')
    setNaming(false)
  }

  return (
    <div className="pr:flex pr:flex-wrap pr:items-center pr:gap-1.5 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-1.5 pr:dark:border-neutral-800">
      <span className="pr:w-14 pr:shrink-0 pr:text-xs pr:font-medium pr:tracking-wide pr:text-neutral-400 pr:uppercase pr:dark:text-neutral-500">
        Views
      </span>

      {views.map((view) => (
        <span key={view.id} className="pr:flex pr:items-center">
          <button
            type="button"
            onClick={() => onApply(view)}
            title={view.query}
            className="pr:flex pr:items-center pr:gap-1.5 pr:rounded-full pr:border pr:border-neutral-300 pr:px-3 pr:py-1 pr:text-sm pr:text-neutral-600 pr:hover:bg-neutral-100 pr:dark:border-neutral-700 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800"
          >
            {view.name}
            <span className="pr:rounded-full pr:bg-neutral-100 pr:px-1.5 pr:text-xs pr:tabular-nums pr:dark:bg-neutral-800">
              {counts[view.id] ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange(views.filter((other) => other.id !== view.id))}
            aria-label={`Delete the "${view.name}" view`}
            className="pr:-ml-1 pr:rounded-full pr:px-1 pr:text-neutral-400 pr:hover:text-red-600"
          >
            ×
          </button>
        </span>
      ))}

      {naming ? (
        <form onSubmit={save} className="pr:flex pr:items-center pr:gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => !name.trim() && setNaming(false)}
            placeholder="Name this view"
            aria-label="Name for the saved view"
            className="pr:w-36 pr:rounded-full pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-1 pr:text-sm pr:dark:border-neutral-700 pr:dark:bg-neutral-900 pr:dark:text-neutral-100"
          />
          <button type="submit" className="pr:text-sm pr:text-blue-600 pr:dark:text-blue-400">
            Save
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          disabled={!draftQuery.trim()}
          title={
            draftQuery.trim()
              ? `Save the current filter: ${draftQuery}`
              : 'Choose a filter first, then save it as a view'
          }
          className="pr:rounded-full pr:px-2.5 pr:py-1 pr:text-sm pr:text-neutral-500 pr:hover:bg-neutral-100 pr:disabled:opacity-40 pr:dark:hover:bg-neutral-800"
        >
          + Save current
        </button>
      )}
    </div>
  )
}

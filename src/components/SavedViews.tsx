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
    <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-1.5 dark:border-neutral-800">
      <span className="w-14 shrink-0 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-500">
        Views
      </span>

      {views.map((view) => (
        <span key={view.id} className="flex items-center">
          <button
            type="button"
            onClick={() => onApply(view)}
            title={view.query}
            className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            {view.name}
            <span className="rounded-full bg-neutral-100 px-1.5 text-xs tabular-nums dark:bg-neutral-800">
              {counts[view.id] ?? 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChange(views.filter((other) => other.id !== view.id))}
            aria-label={`Delete the "${view.name}" view`}
            className="-ml-1 rounded-full px-1 text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </span>
      ))}

      {naming ? (
        <form onSubmit={save} className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => !name.trim() && setNaming(false)}
            placeholder="Name this view"
            aria-label="Name for the saved view"
            className="w-36 rounded-full border border-neutral-300 bg-white px-3 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <button type="submit" className="text-sm text-blue-600 dark:text-blue-400">
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
          className="rounded-full px-2.5 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
        >
          + Save current
        </button>
      )}
    </div>
  )
}

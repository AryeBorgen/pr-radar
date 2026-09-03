import { useState } from 'react'
import type { Bucket } from '../types'

interface Props {
  buckets: Bucket[]
  counts: Record<string, number>
  activeId: string
  onSelect: (id: string) => void
  onChange: (buckets: Bucket[]) => void
  /** The query currently typed in the filter bar, offered for saving. */
  draftQuery: string
}

export default function BucketTabs({
  buckets,
  counts,
  activeId,
  onSelect,
  onChange,
  draftQuery,
}: Props) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  function save(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const bucket: Bucket = {
      id: `custom-${Date.now().toString(36)}`,
      name: trimmed,
      query: draftQuery,
    }
    onChange([...buckets, bucket])
    onSelect(bucket.id)
    setName('')
    setNaming(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      {buckets.map((bucket) => {
        const active = bucket.id === activeId
        const count = counts[bucket.id] ?? 0
        return (
          <span key={bucket.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(bucket.id)}
              aria-current={active ? 'true' : undefined}
              title={bucket.query || 'No filter — every open PR'}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${
                active
                  ? 'bg-neutral-900 font-medium text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {bucket.name}
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
            {bucket.id.startsWith('custom-') && (
              <button
                type="button"
                onClick={() => {
                  onChange(buckets.filter((b) => b.id !== bucket.id))
                  if (active) onSelect(buckets[0]?.id ?? '')
                }}
                aria-label={`Delete the "${bucket.name}" view`}
                className="-ml-1 rounded-full px-1 text-neutral-400 hover:text-red-600"
              >
                ×
              </button>
            )}
          </span>
        )
      })}

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
              ? 'Save the current filter as a view'
              : 'Type a filter first, then save it as a view'
          }
          className="rounded-full px-2.5 py-1 text-sm text-neutral-500 hover:bg-neutral-100 disabled:opacity-40 dark:hover:bg-neutral-800"
        >
          + Save view
        </button>
      )}
    </div>
  )
}

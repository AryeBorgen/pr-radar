interface Props {
  value: string
  onChange: (value: string) => void
  unknown: string[]
  shown: number
  total: number
  fetching: boolean
  onRefresh: () => void
}

const EXAMPLES = ['author:@me', 'review-requested:@me', 'checks:failure', '-is:draft', 'updated:<7d']

export default function FilterBar({
  value,
  onChange,
  unknown,
  shown,
  total,
  fetching,
  onRefresh,
}: Props) {
  return (
    <div className="border-b border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter: is:draft author:@me label:bug -repo:acme/web sort:created-desc"
          aria-label="Filter pull requests"
          className="min-w-72 flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm text-neutral-900 outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            Clear
          </button>
        )}
        <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
          {shown === total ? `${total} open` : `${shown} of ${total}`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={fetching}
          className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {fetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {unknown.length > 0 && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-500">
          Ignored (not supported): <code className="font-mono">{unknown.join(' ')}</code>
        </p>
      )}

      {!value && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          Try
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChange(example)}
              className="rounded border border-neutral-200 px-1.5 py-px font-mono hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              {example}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}

interface Props {
  value: string
  onChange: (value: string) => void
  unknown: string[]
  shown: number
  total: number
  fetching: boolean
  /** PRs whose review and check state are still being fetched. */
  pending: number
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
  pending,
  onRefresh,
}: Props) {
  return (
    <div className="pr:border-b pr:border-neutral-200 pr:px-4 pr:py-2 pr:dark:border-neutral-800">
      <div className="pr:flex pr:flex-wrap pr:items-center pr:gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Filter: is:draft author:@me label:bug -repo:acme/web sort:created-desc"
          aria-label="Filter pull requests"
          className="pr:min-w-72 pr:flex-1 pr:rounded-md pr:border pr:border-neutral-300 pr:bg-white pr:px-3 pr:py-1.5 pr:font-mono pr:text-sm pr:text-neutral-900 pr:outline-none pr:focus:border-blue-500 pr:dark:border-neutral-700 pr:dark:bg-neutral-900 pr:dark:text-neutral-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="pr:text-sm pr:text-neutral-500 pr:hover:text-neutral-900 pr:dark:hover:text-neutral-100"
          >
            Clear
          </button>
        )}
        <span className="pr:text-sm pr:tabular-nums pr:text-neutral-500 pr:dark:text-neutral-400">
          {shown === total ? `${total} open` : `${shown} of ${total}`}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={fetching}
          className="pr:rounded-md pr:border pr:border-neutral-300 pr:px-2.5 pr:py-1 pr:text-sm pr:text-neutral-700 pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:border-neutral-700 pr:dark:text-neutral-300 pr:dark:hover:bg-neutral-800"
        >
          {fetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {pending > 0 && (
        <p className="pr:mt-1.5 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
          Loading review and check status for {pending} more{' '}
          {pending === 1 ? 'pull request' : 'pull requests'} — counts for the review and CI
          views are still settling.
        </p>
      )}

      {unknown.length > 0 && (
        <p className="pr:mt-1.5 pr:text-xs pr:text-amber-700 pr:dark:text-amber-500">
          Ignored (not supported): <code className="pr:font-mono">{unknown.join(' ')}</code>
        </p>
      )}

      {!value && (
        <p className="pr:mt-1.5 pr:flex pr:flex-wrap pr:items-center pr:gap-1.5 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
          Try
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onChange(example)}
              className="pr:rounded pr:border pr:border-neutral-200 pr:px-1.5 pr:py-px pr:font-mono pr:hover:bg-neutral-100 pr:dark:border-neutral-700 pr:dark:hover:bg-neutral-800"
            >
              {example}
            </button>
          ))}
        </p>
      )}
    </div>
  )
}

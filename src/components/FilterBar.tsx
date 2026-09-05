import { useT } from '../i18n/useLocale'
import { useSlots } from './slots'
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
  const { Button, Input } = useSlots()
  const t = useT()
  return (
    <div className="pr:border-b pr:border-neutral-200 pr:px-4 pr:py-2 pr:dark:border-neutral-800">
      <div className="pr:flex pr:flex-wrap pr:items-center pr:gap-2">
        <div className="pr:min-w-72 pr:flex-1 pr:[&>input]:font-mono">
          <Input
            value={value}
            onChange={onChange}
            placeholder={t('filter.placeholder')}
            aria-label={t('filter.label')}
          />
        </div>
        {value && (
          <Button variant="quiet" onClick={() => onChange('')}>
            {t('action.clear')}
          </Button>
        )}
        <span className="pr:text-sm pr:tabular-nums pr:text-neutral-500 pr:dark:text-neutral-400">
          {shown === total
            ? t('filter.openCount', { count: total })
            : t('filter.ofTotal', { shown, total })}
        </span>
        <Button variant="default" onClick={onRefresh} disabled={fetching}>
          {fetching ? t('action.refreshing') : t('action.refresh')}
        </Button>
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
          {t('filter.ignored')} <code className="pr:font-mono">{unknown.join(' ')}</code>
        </p>
      )}

      {!value && (
        <p className="pr:mt-1.5 pr:flex pr:flex-wrap pr:items-center pr:gap-1.5 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
          {t('filter.try')}
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

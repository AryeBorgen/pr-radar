import type { PullRequest } from '../types'
import { useLocale } from '../i18n/useLocale'
import PrActions from './PrActions'
import type { PrActions as Actions } from '../lib/usePrActions'
import type { MessageKey } from '../i18n/en'
import { absoluteTime, relativeTime } from '../lib/time'
import { CheckIcon, PrIcon } from './icons'

/** Perceived-luminance pick so a label's text stays legible on its own colour. */
function labelTextColor(hex: string): string {
  const value = parseInt(hex, 16)
  if (Number.isNaN(value) || hex.length !== 6) return '#1f2328'
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f2328' : '#ffffff'
}

/** NONE and UNKNOWN get no badge: absence of a verdict is not a verdict. */
const REVIEW_BADGE: Record<string, { text: MessageKey; className: string }> = {
  APPROVED: {
    text: 'review.approved',
    className: 'pr:text-emerald-700 pr:bg-emerald-50 pr:dark:text-emerald-400 pr:dark:bg-emerald-950',
  },
  CHANGES_REQUESTED: {
    text: 'review.changesRequested',
    className: 'pr:text-red-700 pr:bg-red-50 pr:dark:text-red-400 pr:dark:bg-red-950',
  },
  REVIEW_REQUIRED: {
    text: 'review.required',
    className: 'pr:text-amber-700 pr:bg-amber-50 pr:dark:text-amber-400 pr:dark:bg-amber-950',
  },
}

export default function PrRow({
  pr,
  now,
  actions,
}: {
  pr: PullRequest
  now: number
  /*
   * Absent where nothing can be done: the embedded radar is a panel in
   * somebody else's application, and a widget that merges branches is a
   * different proposition from one that lists them. A host opts in.
   */
  actions?: Actions
}) {
  const { t, locale } = useLocale()
  const badge = pr.reviewDecision ? REVIEW_BADGE[pr.reviewDecision] : undefined

  return (
    <li className="pr:flex pr:gap-3 pr:border-b pr:border-neutral-200 pr:px-4 pr:py-3 pr:last:border-b-0 pr:hover:bg-neutral-50 pr:dark:border-neutral-800 pr:dark:hover:bg-neutral-900/60">
      <div className="pr:pt-0.5">
        <PrIcon state={pr.state} draft={pr.isDraft} />
      </div>

      <div className="pr:min-w-0 pr:flex-1">
        <div className="pr:flex pr:flex-wrap pr:items-baseline pr:gap-x-2 pr:gap-y-1">
          {/*
            The whole point of the row: a click goes to GitHub. This app never
            tries to be the review surface, only the place you notice things.
          */}
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="pr:font-semibold pr:text-neutral-900 pr:hover:text-blue-600 pr:hover:underline pr:dark:text-neutral-100 pr:dark:hover:text-blue-400"
          >
            {pr.title}
          </a>
          {pr.isDraft && pr.state === 'OPEN' && (
            <span className="pr:rounded-full pr:border pr:border-neutral-300 pr:px-1.5 pr:py-px pr:text-xs pr:text-neutral-500 pr:dark:border-neutral-700">
              {t('state.draft')}
            </span>
          )}
          {pr.state === 'MERGED' && (
            <span className="pr:rounded-full pr:bg-purple-50 pr:px-2 pr:py-px pr:text-xs pr:font-medium pr:text-purple-700 pr:dark:bg-purple-950 pr:dark:text-purple-300">
              {t('state.merged')}
            </span>
          )}
          {pr.state === 'CLOSED' && (
            <span className="pr:rounded-full pr:bg-neutral-100 pr:px-2 pr:py-px pr:text-xs pr:font-medium pr:text-neutral-600 pr:dark:bg-neutral-800 pr:dark:text-neutral-400">
              {t('state.closed')}
            </span>
          )}
          {pr.labels.map((label) => (
            <span
              key={label.name}
              className="pr:rounded-full pr:px-2 pr:py-px pr:text-xs pr:font-medium"
              style={{ backgroundColor: `#${label.color}`, color: labelTextColor(label.color) }}
            >
              {label.name}
            </span>
          ))}
        </div>

        <div className="pr:mt-1 pr:flex pr:flex-wrap pr:items-center pr:gap-x-1.5 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
          <span className="pr:font-medium pr:text-neutral-600 pr:dark:text-neutral-300">{pr.repo}</span>
          <span>#{pr.number}</span>
          <span aria-hidden="true">·</span>
          <span title={absoluteTime(pr.createdAt, locale)}>
            {t('row.opened', { when: relativeTime(pr.createdAt, now, locale) })}
          </span>
          {pr.author && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('row.by', { author: pr.author.login })}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          {pr.mergedAt ? (
            <span title={absoluteTime(pr.mergedAt, locale)}>
              {t('row.merged', { when: relativeTime(pr.mergedAt, now, locale) })}
            </span>
          ) : (
            <span title={absoluteTime(pr.updatedAt, locale)}>
              {t('row.updated', { when: relativeTime(pr.updatedAt, now, locale) })}
            </span>
          )}
          {pr.requestedReviewers.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{t('row.waitingOn', { who: pr.requestedReviewers.join(', ') })}</span>
            </>
          )}
        </div>
      </div>

      <div className="pr:flex pr:shrink-0 pr:items-center pr:gap-2 pr:self-start pr:pt-0.5">
        {badge && (
          <span className={`pr:rounded-full pr:px-2 pr:py-0.5 pr:text-xs pr:font-medium ${badge.className}`}>
            {t(badge.text)}
          </span>
        )}
        <CheckIcon state={pr.checkState} />
        <div className="pr:flex pr:-space-x-1">
          {pr.assignees
            .filter((assignee) => assignee.avatarUrl)
            .slice(0, 3)
            .map((assignee) => (
              <img
                key={assignee.login}
                src={assignee.avatarUrl}
                alt={assignee.login}
                title={`Assigned: ${assignee.login}`}
                width={20}
                height={20}
                className="pr:rounded-full pr:ring-1 pr:ring-white pr:dark:ring-neutral-950"
              />
            ))}
        </div>
      </div>
      {actions && (
        <div className="pr:shrink-0 pr:pt-0.5">
          <PrActions pr={pr} actions={actions} />
        </div>
      )}
    </li>
  )
}

import type { PullRequest } from '../types'
import { PrIcon, CheckIcon } from './icons'
import { absoluteTime, relativeTime } from '../lib/time'
import { useLocale } from '../i18n/useLocale'
import type { MessageKey } from '../i18n/en'
import PrActions from './PrActions'
import type { PrActions as Actions } from '../lib/usePrActions'
import { useSlots, type ChipTone } from './slots'

/** Readable text over a GitHub label's own background colour. */
function labelTextColor(hex: string): string {
  const value = parseInt(hex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f2328' : '#ffffff'
}

/** NONE and UNKNOWN get no badge: absence of a verdict is not a verdict. */
const REVIEW_BADGE: Record<string, { text: MessageKey; tone: ChipTone }> = {
  APPROVED: { text: 'review.approved', tone: 'success' },
  CHANGES_REQUESTED: { text: 'review.changesRequested', tone: 'danger' },
  REVIEW_REQUIRED: { text: 'review.required', tone: 'warning' },
}

const STATE_CHIP: Record<string, { text: MessageKey; tone: ChipTone }> = {
  MERGED: { text: 'state.merged', tone: 'info' },
  CLOSED: { text: 'state.closed', tone: 'neutral' },
}

/**
 * One pull request.
 *
 * The row is assembled here and *arranged* by the `Row` slot, which a host can
 * replace. Everything handed to that slot is already rendered -- a host gets
 * `title`, `meta`, `badges` and `actions` as nodes, never the pull request they
 * came from. Publishing `PullRequest` would freeze the type the whole
 * architecture rests on being free to change.
 */
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
  const { Row, Chip, Link, Avatar } = useSlots()
  const badge = pr.reviewDecision ? REVIEW_BADGE[pr.reviewDecision] : undefined
  const stateChip = STATE_CHIP[pr.state]

  const dot = <span aria-hidden="true">·</span>

  return (
    <Row
      state={pr.state.toLowerCase()}
      draft={pr.isDraft}
      icon={<PrIcon state={pr.state} draft={pr.isDraft} />}
      title={
        /*
          The whole point of the row: a click goes to GitHub. This app never
          tries to be the review surface, only the place you notice things.
        */
        <Link href={pr.url} variant="title" external>
          {pr.title}
        </Link>
      }
      badges={
        <>
          {pr.isDraft && pr.state === 'OPEN' && <Chip tone="neutral">{t('state.draft')}</Chip>}
          {stateChip && <Chip tone={stateChip.tone}>{t(stateChip.text)}</Chip>}
          {pr.labels.map((label) => (
            <Chip
              key={label.name}
              tone="neutral"
              color={{ background: `#${label.color}`, text: labelTextColor(label.color) }}
            >
              {label.name}
            </Chip>
          ))}
        </>
      }
      meta={
        <>
          <span className="pr:font-medium pr:text-neutral-600 pr:dark:text-neutral-300">
            {pr.repo}
          </span>
          <span>#{pr.number}</span>
          {dot}
          <span title={absoluteTime(pr.createdAt, locale)}>
            {t('row.opened', { when: relativeTime(pr.createdAt, now, locale) })}
          </span>
          {pr.author && (
            <>
              {dot}
              <span>{t('row.by', { author: pr.author.login })}</span>
            </>
          )}
          {dot}
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
              {dot}
              <span>{t('row.waitingOn', { who: pr.requestedReviewers.join(', ') })}</span>
            </>
          )}
        </>
      }
      trailing={
        <>
          {badge && <Chip tone={badge.tone}>{t(badge.text)}</Chip>}
          <CheckIcon state={pr.checkState} />
          {/* An avatar with no URL is an <img src="">, which React warns about
              and some browsers answer by re-requesting the page. Filtered, not
              defaulted: no picture is better than a broken one. */}
          <span className="pr:flex pr:-space-x-1">
            {pr.assignees
              .filter((assignee) => assignee.avatarUrl)
              .slice(0, 3)
              .map((assignee) => (
                <span key={assignee.login} title={t('row.assigned', { who: assignee.login })}>
                  <Avatar src={assignee.avatarUrl} alt={assignee.login} size={20} />
                </span>
              ))}
          </span>
        </>
      }
      actions={actions ? <PrActions pr={pr} actions={actions} /> : null}
    />
  )
}

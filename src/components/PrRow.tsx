import type { PullRequest } from '../types'
import { absoluteTime, relativeAge } from '../lib/time'
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
const REVIEW_BADGE: Record<string, { text: string; className: string }> = {
  APPROVED: {
    text: 'Approved',
    className: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950',
  },
  CHANGES_REQUESTED: {
    text: 'Changes requested',
    className: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950',
  },
  REVIEW_REQUIRED: {
    text: 'Review required',
    className: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950',
  },
}

export default function PrRow({ pr, now }: { pr: PullRequest; now: number }) {
  const badge = pr.reviewDecision ? REVIEW_BADGE[pr.reviewDecision] : undefined

  return (
    <li className="flex gap-3 border-b border-neutral-200 px-4 py-3 last:border-b-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/60">
      <div className="pt-0.5">
        <PrIcon state={pr.state} draft={pr.isDraft} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {/*
            The whole point of the row: a click goes to GitHub. This app never
            tries to be the review surface, only the place you notice things.
          */}
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-neutral-900 hover:text-blue-600 hover:underline dark:text-neutral-100 dark:hover:text-blue-400"
          >
            {pr.title}
          </a>
          {pr.isDraft && pr.state === 'OPEN' && (
            <span className="rounded-full border border-neutral-300 px-1.5 py-px text-xs text-neutral-500 dark:border-neutral-700">
              Draft
            </span>
          )}
          {pr.state === 'MERGED' && (
            <span className="rounded-full bg-purple-50 px-2 py-px text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              Merged
            </span>
          )}
          {pr.state === 'CLOSED' && (
            <span className="rounded-full bg-neutral-100 px-2 py-px text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Closed
            </span>
          )}
          {pr.labels.map((label) => (
            <span
              key={label.name}
              className="rounded-full px-2 py-px text-xs font-medium"
              style={{ backgroundColor: `#${label.color}`, color: labelTextColor(label.color) }}
            >
              {label.name}
            </span>
          ))}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-medium text-neutral-600 dark:text-neutral-300">{pr.repo}</span>
          <span>#{pr.number}</span>
          <span aria-hidden="true">·</span>
          <span title={absoluteTime(pr.createdAt)}>opened {relativeAge(pr.createdAt, now)} ago</span>
          {pr.author && (
            <>
              <span aria-hidden="true">·</span>
              <span>by {pr.author.login}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          {pr.mergedAt ? (
            <span title={absoluteTime(pr.mergedAt)}>
              merged {relativeAge(pr.mergedAt, now)} ago
            </span>
          ) : (
            <span title={absoluteTime(pr.updatedAt)}>
              updated {relativeAge(pr.updatedAt, now)} ago
            </span>
          )}
          {pr.requestedReviewers.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>waiting on {pr.requestedReviewers.join(', ')}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start pt-0.5">
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
            {badge.text}
          </span>
        )}
        <CheckIcon state={pr.checkState} />
        <div className="flex -space-x-1">
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
                className="rounded-full ring-1 ring-white dark:ring-neutral-950"
              />
            ))}
        </div>
      </div>
    </li>
  )
}

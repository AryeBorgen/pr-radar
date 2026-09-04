import type { PullRequest } from '../types'

/**
 * The GitHub-style dropdown menus.
 *
 * Unlike the axes, these options are not known in advance — they are whoever
 * actually appears in the fetched list. That is the property worth keeping: the
 * Author menu offers the people who have open PRs right now, not a roster.
 */
export interface MenuOption {
  value: string
  label: string
  /** Shown next to the label where GitHub shows an avatar. */
  avatarUrl?: string
  /** Label colour, for the Label menu. */
  color?: string
  count: number
}

export interface MenuSpec {
  id: string
  label: string
  /** The qualifier this menu writes, e.g. `author`. */
  qualifier: string
  /**
   * Multiple selections in one menu are allowed for every menu but Sort. They
   * land in a single filter stage, where the language ORs repeated qualifiers —
   * except `label:`, which it ANDs, matching GitHub in both cases.
   */
  multiple: boolean
  /** Show a search box once the list gets long. */
  searchable: boolean
}

export const MENUS: MenuSpec[] = [
  { id: 'repo', label: 'Repository', qualifier: 'repo', multiple: true, searchable: true },
  { id: 'author', label: 'Author', qualifier: 'author', multiple: true, searchable: true },
  { id: 'label', label: 'Label', qualifier: 'label', multiple: true, searchable: true },
  { id: 'assignee', label: 'Assignee', qualifier: 'assignee', multiple: true, searchable: true },
  { id: 'reviewer', label: 'Reviewer', qualifier: 'review-requested', multiple: true, searchable: true },
]

/**
 * How far back closed pull requests are shown.
 *
 * The default is one month, which together with the 100-per-repository page cap
 * gives the smaller of the two — a month of history where a repository is busy,
 * and the last 100 where it is quiet. `All time` is still bounded by that cap,
 * and the UI says when a repository hit it.
 */
export const PERIOD_OPTIONS: { value: string; label: string; query: string }[] = [
  { value: '7d', label: 'Past week', query: 'closed:>7d' },
  { value: '1mo', label: 'Past month', query: 'closed:>1mo' },
  { value: '3mo', label: 'Past 3 months', query: 'closed:>3mo' },
  { value: '1y', label: 'Past year', query: 'closed:>1y' },
  { value: 'all', label: 'All time', query: '' },
]

export const DEFAULT_PERIOD = '1mo'

export function periodQuery(period: string): string {
  return PERIOD_OPTIONS.find((option) => option.value === period)?.query ?? ''
}

export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'updated-desc', label: 'Recently updated' },
  { value: 'updated-asc', label: 'Least recently updated' },
  { value: 'created-desc', label: 'Newest' },
  { value: 'created-asc', label: 'Oldest' },
  { value: 'merged-desc', label: 'Recently merged' },
  { value: 'merged-asc', label: 'First merged' },
]

/** Selected values per menu id. */
export type MenuSelection = Record<string, string[]>

function tally(values: { value: string; label?: string; avatarUrl?: string; color?: string }[]) {
  const seen = new Map<string, MenuOption>()
  for (const entry of values) {
    const key = entry.value.toLowerCase()
    const existing = seen.get(key)
    if (existing) existing.count += 1
    else
      seen.set(key, {
        value: entry.value,
        label: entry.label ?? entry.value,
        // Spread rather than assigned: an optional field left out is not the
        // same as one present and undefined, and absent is what is meant.
        ...(entry.avatarUrl ? { avatarUrl: entry.avatarUrl } : {}),
        ...(entry.color ? { color: entry.color } : {}),
        count: 1,
      })
  }
  // Most-used first: the people and labels you filter by are the frequent ones.
  return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/**
 * Build each menu's options from the pull requests in scope.
 *
 * `prs` should be the list narrowed by everything *except* the menus, so an
 * author with nothing left after the other filters drops out of the menu rather
 * than offering a choice that leads to an empty list.
 */
export function menuOptions(prs: PullRequest[]): Record<string, MenuOption[]> {
  return {
    repo: tally(prs.map((pr) => ({ value: pr.repo }))),
    author: tally(
      prs
        .filter((pr) => pr.author)
        .map((pr) => ({ value: pr.author!.login, avatarUrl: pr.author!.avatarUrl })),
    ),
    label: tally(
      prs.flatMap((pr) => pr.labels.map((label) => ({ value: label.name, color: label.color }))),
    ),
    assignee: tally(
      prs.flatMap((pr) =>
        pr.assignees.map((person) => ({ value: person.login, avatarUrl: person.avatarUrl })),
      ),
    ),
    reviewer: tally(prs.flatMap((pr) => pr.requestedReviewers.map((name) => ({ value: name })))),
  }
}

/** Quote a value that would otherwise tokenize into two terms. */
function quote(value: string): string {
  return /\s/.test(value) ? `"${value}"` : value
}

/**
 * One filter stage per menu, so a menu narrows the axes instead of widening
 * them. Sort is its own stage because it filters nothing.
 *
 * The period stage is only added when closed PRs are in scope: applied to the
 * open list it would filter everything out, since an open PR has no closed date.
 */
export function menuStages(
  selection: MenuSelection,
  sort: string,
  period = '',
  withClosed = false,
): string[] {
  const stages = MENUS.map((menu) => {
    const chosen = selection[menu.id] ?? []
    return chosen.map((value) => `${menu.qualifier}:${quote(value)}`).join(' ')
  })
  if (withClosed) stages.push(periodQuery(period))
  return sort ? [...stages, `sort:${sort}`] : stages
}

export function toggle(values: string[] | undefined, value: string, multiple: boolean): string[] {
  const current = values ?? []
  if (current.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
    return current.filter((entry) => entry.toLowerCase() !== value.toLowerCase())
  }
  return multiple ? [...current, value] : [value]
}

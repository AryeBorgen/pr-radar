import type { PullRequest } from '../types'

/**
 * A GitHub-flavoured filter language.
 *
 * The point of reusing GitHub's syntax is that nobody has to learn anything:
 * `is:draft author:@me -label:wip` means here what it means there. It is also
 * why buckets are stored as plain query strings — a saved bucket and something
 * typed into the search box are the same kind of thing, so any view a user
 * builds by hand can be saved, shared, and edited as text.
 */

export interface Term {
  key: string
  /** Comparison for date keys; empty for everything else. */
  op: '' | '<' | '>' | '<=' | '>='
  value: string
  negated: boolean
}

export interface ParsedQuery {
  terms: Term[]
  /** Bare words, matched against title, number and repository. */
  text: string[]
  sort: SortKey
  /** Qualifiers we do not implement, surfaced so a filter never lies silently. */
  unknown: string[]
}

export type SortKey = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc'

const SORT_KEYS: SortKey[] = ['updated-desc', 'updated-asc', 'created-desc', 'created-asc']

/** Split on whitespace, but keep `label:"needs design"` in one piece. */
export function tokenize(query: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false

  for (const char of query) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (/\s/.test(char) && !quoted) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current) tokens.push(current)
  return tokens
}

const DATE_KEYS = new Set(['updated', 'created'])
const KNOWN_KEYS = new Set([
  'is',
  'draft',
  'author',
  'assignee',
  'review-requested',
  'reviewed-by',
  'label',
  'repo',
  'org',
  'review',
  'checks',
  'status',
  'no',
  'updated',
  'created',
])

export function parseQuery(query: string): ParsedQuery {
  const terms: Term[] = []
  const text: string[] = []
  const unknown: string[] = []
  let sort: SortKey = 'updated-desc'

  for (const token of tokenize(query)) {
    const negated = token.startsWith('-')
    const body = negated ? token.slice(1) : token
    const colon = body.indexOf(':')

    if (colon <= 0) {
      if (body) text.push(body.toLowerCase())
      continue
    }

    const key = body.slice(0, colon).toLowerCase()
    let value = body.slice(colon + 1)

    if (key === 'sort') {
      if ((SORT_KEYS as string[]).includes(value)) sort = value as SortKey
      else unknown.push(token)
      continue
    }

    if (!KNOWN_KEYS.has(key)) {
      unknown.push(token)
      continue
    }

    let op: Term['op'] = ''
    if (DATE_KEYS.has(key)) {
      const match = /^(<=|>=|<|>)/.exec(value)
      if (!match) {
        unknown.push(token)
        continue
      }
      op = match[1] as Term['op']
      value = value.slice(match[1].length)
    }

    terms.push({ key, op, value: value.toLowerCase(), negated })
  }

  return { terms, text, sort, unknown }
}

/**
 * Resolve a filter value into a timestamp. Accepts an ISO date (`2026-01-01`)
 * or an age (`7d`, `12h`, `2w`), where an age means "the moment that long ago" —
 * so `updated:<7d` reads as "last touched more than seven days ago".
 */
function resolveDate(value: string, now: number): number | null {
  const age = /^(\d+)([hdw])$/.exec(value)
  if (age) {
    const amount = Number(age[1])
    const unit = { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[age[2] as 'h' | 'd' | 'w']
    return now - amount * unit
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function compare(left: number, op: Term['op'], right: number): boolean {
  switch (op) {
    case '<':
      return left < right
    case '<=':
      return left <= right
    case '>':
      return left > right
    case '>=':
      return left >= right
    default:
      return false
  }
}

function has(list: string[], value: string): boolean {
  return list.some((entry) => entry.toLowerCase() === value)
}

/** Does a single term hold for a single PR? Negation is applied by the caller. */
function matchTerm(pr: PullRequest, term: Term, viewer: string, now: number): boolean {
  const value = term.value === '@me' ? viewer.toLowerCase() : term.value

  switch (term.key) {
    case 'is':
      if (value === 'open') return true
      if (value === 'draft') return pr.isDraft
      if (value === 'ready') return !pr.isDraft
      // `is:merged` / `is:closed` cannot match: only open PRs are fetched.
      return false
    case 'draft':
      return value === 'false' ? !pr.isDraft : pr.isDraft
    case 'author':
      return (pr.author?.login ?? '').toLowerCase() === value
    case 'assignee':
      return has(
        pr.assignees.map((a) => a.login),
        value,
      )
    case 'review-requested':
      return has(pr.requestedReviewers, value)
    case 'reviewed-by':
      return has(pr.reviewedBy, value)
    case 'label':
      return has(
        pr.labels.map((l) => l.name),
        value,
      )
    case 'repo':
      return pr.repo.toLowerCase() === value
    case 'org':
      return pr.repo.split('/')[0].toLowerCase() === value
    case 'review': {
      const wanted = value === 'required' ? 'review_required' : value
      return pr.reviewDecision === wanted.replace(/-/g, '_').toUpperCase()
    }
    case 'checks':
    case 'status':
      return pr.checkState === value.toUpperCase()
    case 'no':
      if (value === 'label') return pr.labels.length === 0
      if (value === 'assignee') return pr.assignees.length === 0
      if (value === 'reviewer') return pr.requestedReviewers.length === 0
      return false
    case 'updated':
    case 'created': {
      const target = resolveDate(term.value, now)
      if (target === null) return false
      const actual = Date.parse(term.key === 'updated' ? pr.updatedAt : pr.createdAt)
      return compare(actual, term.op, target)
    }
    default:
      return false
  }
}

/**
 * Same-key positive terms are OR'd — `author:a author:b` means either — except
 * `label`, which is AND'd, matching GitHub's own behaviour for both. Negative
 * terms are always AND'd: every one of them must fail to match.
 */
function matchesTerms(pr: PullRequest, terms: Term[], viewer: string, now: number): boolean {
  const positive = new Map<string, Term[]>()

  for (const term of terms) {
    if (term.negated) {
      if (matchTerm(pr, term, viewer, now)) return false
      continue
    }
    const group = positive.get(term.key)
    if (group) group.push(term)
    else positive.set(term.key, [term])
  }

  for (const [key, group] of positive) {
    const results = group.map((term) => matchTerm(pr, term, viewer, now))
    const ok = key === 'label' ? results.every(Boolean) : results.some(Boolean)
    if (!ok) return false
  }
  return true
}

function matchesText(pr: PullRequest, text: string[]): boolean {
  if (text.length === 0) return true
  const haystack = `${pr.title} ${pr.repo} #${pr.number}`.toLowerCase()
  return text.every((word) => haystack.includes(word))
}

function sortPrs(prs: PullRequest[], sort: SortKey): PullRequest[] {
  const sorted = [...prs]
  switch (sort) {
    case 'updated-asc':
      return sorted.sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    case 'created-desc':
      return sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    case 'created-asc':
      return sorted.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    default:
      return sorted.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }
}

export interface ApplyOptions {
  viewer: string
  /** Injectable so tests are not clock-dependent. */
  now?: number
}

export function applyQuery(
  prs: PullRequest[],
  query: string,
  { viewer, now = Date.now() }: ApplyOptions,
): PullRequest[] {
  const parsed = parseQuery(query)
  const matched = prs.filter(
    (pr) => matchesTerms(pr, parsed.terms, viewer, now) && matchesText(pr, parsed.text),
  )
  return sortPrs(matched, parsed.sort)
}

/**
 * The rule: a change that reaches users needs an issue behind it.
 *
 * The rule is only worth having if the exemptions are right. One that also fires
 * on a typo in the README is one people learn to route around, and a rule people
 * route around protects nothing. So infrastructure, documentation and the bots
 * pass without ceremony, and everything that touches the application does not.
 *
 * The logic lives here rather than inside the workflow so it can be tested
 * without opening a pull request to find out.
 */

/** Paths that describe how the project is built rather than what it does. */
const EXEMPT = [/^\.github\//, /\.md$/, /^media\//, /^docs\//, /^LICENSE$/]

/** package.json plus its lockfile and nothing else: the shape of a release. */
const RELEASE_FILES = ['package.json', 'package-lock.json']

export interface PullRequest {
  author: string
  files: string[]
  labels: string[]
  title?: string
}

/** Why this pull request needs no issue, or undefined if it does. */
export function exemption(pr: PullRequest): string | undefined {
  if (pr.author.endsWith('[bot]')) return `was opened by ${pr.author.replace('[bot]', '')}`
  if (pr.labels.includes('no-issue')) return 'is labelled no-issue'

  // "Only", not "mostly": a pull request that edits the README and also rewrites
  // the filter engine is not a documentation change.
  if (pr.files.length > 0 && pr.files.every((f) => EXEMPT.some((p) => p.test(f)))) {
    return 'changes only infrastructure, documentation or media'
  }

  // A version bump touches package.json and its lockfile and nothing else.
  // Both halves are needed: the files alone would also exempt adding a
  // dependency, and the title alone would exempt anything somebody named after a
  // version. Found by running this rule over the repository's own history, where
  // it asked for an issue to justify cutting a release.
  const isRelease =
    pr.title !== undefined &&
    /^v?\d+\.\d+\.\d+$/.test(pr.title.trim()) &&
    pr.files.length > 0 &&
    pr.files.every((f) => RELEASE_FILES.includes(f))
  if (isRelease) return 'is a release'

  return undefined
}

/**
 * Issue numbers this pull request points at.
 *
 * Two kinds of word count. `Fixes`, `Closes` and `Resolves` close the issue on
 * merge; `Refs`, `Part of` and `Towards` do not. Both satisfy this rule, because
 * the rule asks for context rather than for housekeeping -- and the first time it
 * met a real multi-part change it demanded a closing keyword on every pull
 * request, which would have closed the tracking issue on the first merge and
 * left the remaining three orphaned.
 *
 * A bare `#12` still does not count. It appears in prose constantly -- "see #12
 * for background", a quoted error, a version number -- and a word in front of it
 * is what separates a claim of intent from an accident.
 */
export function issueReferences(body: string | null | undefined, repo = ''): number[] {
  if (!body) return []

  // Fenced code and quoted replies are somebody else's words, not this pull
  // request's intent.
  const prose = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*>.*$/gm, '')

  const closing = 'close[sd]?|fix(?:e[sd])?|resolve[sd]?'
  const referring = 'refs?|references?|part of|towards?|relate[sd]? to|see also'
  const keyword = `(?:${closing}|${referring})`
  const found = new Set<number>()

  for (const m of prose.matchAll(new RegExp(`${keyword}\\s+#(\\d+)`, 'gi'))) {
    found.add(Number(m[1]))
  }
  if (repo) {
    const url = `https://github\\.com/${repo.replace('/', '\\/')}/issues/(\\d+)`
    for (const m of prose.matchAll(new RegExp(`${keyword}\\s+${url}`, 'gi'))) {
      found.add(Number(m[1]))
    }
  }
  return [...found].sort((a, b) => a - b)
}

/**
 * The headings a GitHub issue form will render into the issue body.
 *
 * Read out of the form rather than copied, so changing a template updates the
 * check with it instead of silently drifting away from it.
 */
export function templateHeadings(yaml: string): string[] {
  const headings: string[] = []
  // Deliberately not a YAML parser: the shape needed is one key, and a
  // dependency for it would have to be installed on the runner.
  for (const m of yaml.matchAll(/^\s*label:\s*(.+?)\s*$/gm)) {
    headings.push((m[1] ?? '').replace(/^['"]|['"]$/g, ''))
  }
  return headings
}

export interface Issue {
  state: string
  body: string | null
}

export type Verdict = { ok: true } | { ok: false; reason: string }

/**
 * Whether a linked issue is one somebody actually filled in.
 *
 * GitHub already enforces a form's required fields at creation, so this is not
 * re-checking that. What it catches is the issue opened *around* the form -- two
 * words in a blank issue, filed only to get past this check -- which is exactly
 * what a rule like this invites.
 */
export function verdict({ issue, headings }: { issue: Issue | null; headings: string[][] }): Verdict {
  if (!issue) return { ok: false, reason: 'the issue does not exist in this repository' }
  if (issue.state !== 'open') return { ok: false, reason: 'the issue is closed' }

  const body = issue.body ?? ''
  const sections = new Map<string, string>()
  const parts = body.split(/^###\s+/m).slice(1)
  for (const part of parts) {
    const [head = '', ...rest] = part.split('\n')
    sections.set(head.trim(), rest.join('\n').trim())
  }

  const matched = headings.find((set) => set.some((h) => sections.has(h)))
  if (!matched) {
    return { ok: false, reason: 'the issue was not opened from a template' }
  }

  const empty = matched.filter((h) => sections.has(h) && sections.get(h) === '')
  if (empty.length > 0) {
    return { ok: false, reason: `the issue leaves ${empty.join(' and ')} empty` }
  }
  return { ok: true }
}

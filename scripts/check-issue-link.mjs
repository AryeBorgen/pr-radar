// Decides whether a pull request satisfies the "changes that reach users need an
// issue" rule, and explains itself when it does not.
//
// The decisions live in src/lib/issueLink.ts, which has unit tests. This file is
// only plumbing: read the pull request, fetch the issue, print a verdict.
//
// Usage (inside a workflow):
//   node scripts/check-issue-link.mjs <event.json>
import { readFileSync, readdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { closingReferences, exemption, templateHeadings, verdict } from '../src/lib/issueLink.ts'

const event = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const pr = event.pull_request
const repo = event.repository.full_name
const token = process.env.GITHUB_TOKEN

// Every value that reaches this URL came out of the event file, and part of that
// file -- the pull request's body -- is written by whoever opened it. The issue
// numbers are captured by `\d+` so nothing but digits can survive, but "the
// regex upstream is careful" is an argument rather than a defence, and CodeQL
// was right to say so. The URL is assembled from validated pieces instead.
const OWNER_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const api = async (segments, search = '') => {
  if (!OWNER_REPO.test(repo)) throw new Error(`refusing to call out for repository "${repo}"`)
  for (const segment of segments) {
    if (!/^[A-Za-z0-9_.-]+$/.test(String(segment))) {
      throw new Error(`refusing to build a request path from "${segment}"`)
    }
  }

  const url = new URL(`https://api.github.com/repos/${repo}/${segments.join('/')}${search}`)
  if (url.origin !== 'https://api.github.com') throw new Error('refusing to leave api.github.com')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'pr-radar-issue-check',
    },
  })
  if (!response.ok) return null
  return response.json()
}

const say = (markdown) => {
  console.log(markdown.replace(/^#+ /gm, '').trim())
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n')
  }
}

const files = (await api(['pulls', pr.number, 'files'], '?per_page=100') ?? []).map(
  (f) => f.filename,
)

const excused = exemption({
  author: pr.user.login,
  files,
  labels: (pr.labels ?? []).map((l) => l.name),
  title: pr.title,
})

if (excused) {
  say(`### No issue needed\n\nExempt: this pull request ${excused}.`)
  process.exit(0)
}

const refs = closingReferences(pr.body, repo)

const howToFix = `
**Add a line to the pull request description:**

\`\`\`
Fixes #123
\`\`\`

\`Closes\` and \`Resolves\` work too. A bare \`#123\` does not -- the keyword is
what closes the issue when this merges.

No issue yet? [Report a bug](https://github.com/${repo}/issues/new?template=bug_report.yml) ·
[Suggest an idea](https://github.com/${repo}/issues/new?template=feature_request.yml)

Infrastructure, documentation or media only? Those are exempt automatically. For
anything else that genuinely does not warrant an issue, a maintainer can apply
the \`no-issue\` label.
`

if (refs.length === 0) {
  say(`### This pull request needs an issue\n\nIt changes files outside infrastructure and documentation, so it needs an issue describing why.\n${howToFix}`)
  process.exit(1)
}

// The headings each template will produce, read from the templates themselves so
// that editing one updates this check with it.
const dir = '.github/ISSUE_TEMPLATE'
const headings = readdirSync(dir)
  .filter((f) => /\.ya?ml$/.test(f) && f !== 'config.yml')
  .map((f) => templateHeadings(readFileSync(join(dir, f), 'utf8')))
  .filter((set) => set.length > 0)

const problems = []
for (const number of refs) {
  const issue = await api(['issues', number])
  // The issues endpoint also answers for pull requests; one is not an issue.
  const result = verdict({ issue: issue?.pull_request ? null : issue, headings })
  if (result.ok) {
    say(`### Issue found\n\nThis pull request closes [#${number}](https://github.com/${repo}/issues/${number}).`)
    process.exit(0)
  }
  problems.push(`- **#${number}**: ${result.reason}`)
}

say(`### The linked issue is not usable\n\n${problems.join('\n')}\n${howToFix}`)
process.exit(1)

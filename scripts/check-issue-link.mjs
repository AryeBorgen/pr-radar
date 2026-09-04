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
import { issueReferences, exemption, templateHeadings, verdict } from '../src/lib/issueLink.ts'

const event = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const pr = event.pull_request
const token = process.env.GITHUB_TOKEN

// The runner tells us which repository this is. The event file says so too, but
// that file is parsed here and part of it -- the pull request body -- is written
// by whoever opened it, so taking the value from the environment removes the
// path from file data to a network call entirely rather than guarding it.
const repo = process.env.GITHUB_REPOSITORY
if (!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
  throw new Error(`GITHUB_REPOSITORY is not a usable owner/name: ${repo}`)
}

// The only values from the event file that reach a URL are issue and pull request
// numbers, and they arrive as numbers rather than as text: anything that is not a
// non-negative integer is refused before it can be interpolated. Together with
// taking the repository from the environment, nothing read from the file reaches
// the network as a string.
const number = (value) => {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0) throw new Error(`not an issue number: ${String(value)}`)
  return n
}

const api = async (kind, id, search = '') => {
  const path = kind === 'files' ? `pulls/${number(id)}/files` : `issues/${number(id)}`
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}${search}`, {
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

const files = (await api('files', pr.number, '?per_page=100') ?? []).map(
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

const refs = issueReferences(pr.body, repo)

const howToFix = `
**Add a line to the pull request description:**

\`\`\`
Fixes #123
\`\`\`

\`Closes\` and \`Resolves\` work too, and so do \`Refs\`, \`Part of\` and \`Towards\`
for work spread over several pull requests -- those point at the issue without
closing it. A bare \`#123\` does not count: it turns up in prose too often to read
as intent.

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
for (const ref of refs) {
  const issue = await api('issue', ref)
  // The issues endpoint also answers for pull requests; one is not an issue.
  const result = verdict({ issue: issue?.pull_request ? null : issue, headings })
  if (result.ok) {
    // Deliberately not "closes": `Refs` and `Part of` point at an issue without
    // closing it, and saying otherwise would be wrong on exactly the pull
    // requests this wording was added for.
    say(`### Issue found\n\nThis pull request is linked to [#${ref}](https://github.com/${repo}/issues/${ref}).`)
    process.exit(0)
  }
  problems.push(`- **#${ref}**: ${result.reason}`)
}

say(`### The linked issue is not usable\n\n${problems.join('\n')}\n${howToFix}`)
process.exit(1)

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

const api = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
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

const files = (await api(`/repos/${repo}/pulls/${pr.number}/files?per_page=100`) ?? []).map(
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
  const issue = await api(`/repos/${repo}/issues/${number}`)
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

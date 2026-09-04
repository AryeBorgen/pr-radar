import { describe, expect, it } from 'vitest'
import { issueReferences, exemption, templateHeadings, verdict } from './issueLink'

/**
 * The rule is "a change that reaches users needs an issue", and the whole design
 * lives or dies on the exemptions: a rule that also fires on a typo in the
 * README is one people learn to route around.
 */

const TOUCHES_APP = ['src/App.tsx']

describe('exemption', () => {
  it('lets the machine through', () => {
    expect(exemption({ author: 'dependabot[bot]', files: TOUCHES_APP, labels: [] })).toBe(
      'was opened by dependabot',
    )
  })

  it('lets infrastructure and documentation through', () => {
    expect(exemption({ author: 'anyone', files: ['.github/workflows/ci.yml'], labels: [] })).toBe(
      'changes only infrastructure, documentation or media',
    )
    expect(exemption({ author: 'anyone', files: ['README.md', 'docs/a.md'], labels: [] })).toBeTruthy()
    expect(exemption({ author: 'anyone', files: ['media/icon.svg'], labels: [] })).toBeTruthy()
  })

  it('does not let a source change through on the coat-tails of a doc change', () => {
    // The exemption is "only", not "mostly". A pull request that edits the README
    // and also rewrites the filter engine is not a documentation change.
    expect(exemption({ author: 'anyone', files: ['README.md', 'src/lib/filter.ts'], labels: [] })).toBeUndefined()
  })

  it('lets a release through', () => {
    // Found by running the rule over this repository's own history: a version
    // bump touches package.json and its lockfile and nothing else, and asking
    // for an issue to justify cutting a release is the tedium this rule was
    // supposed to avoid.
    expect(
      exemption({ author: 'anyone', files: ['package.json', 'package-lock.json'], labels: [], title: '0.1.1' }),
    ).toBe('is a release')
    expect(
      exemption({ author: 'anyone', files: ['package.json', 'package-lock.json'], labels: [], title: 'v2.0.0' }),
    ).toBeTruthy()
  })

  it('does not let a dependency change ride in as a release', () => {
    // Same two files, but the title is not a version, so it is a real change.
    expect(
      exemption({ author: 'anyone', files: ['package.json', 'package-lock.json'], labels: [], title: 'Add lodash' }),
    ).toBeUndefined()
    // And a version-titled pull request that touches source is not a release.
    expect(
      exemption({ author: 'anyone', files: ['package.json', 'src/App.tsx'], labels: [], title: '0.1.1' }),
    ).toBeUndefined()
  })

  it('honours the escape hatch', () => {
    expect(exemption({ author: 'anyone', files: TOUCHES_APP, labels: ['no-issue'] })).toBe(
      'is labelled no-issue',
    )
  })

  it('requires an issue for anything else', () => {
    expect(exemption({ author: 'anyone', files: TOUCHES_APP, labels: ['bug'] })).toBeUndefined()
  })

  it('requires an issue when a pull request changes nothing it recognises', () => {
    // An empty or unknown file list must not read as "documentation only".
    expect(exemption({ author: 'anyone', files: [], labels: [] })).toBeUndefined()
  })
})

describe('issueReferences', () => {
  it('finds the usual keywords, in any case', () => {
    expect(issueReferences('Fixes #12')).toEqual([12])
    expect(issueReferences('closes #3 and resolves #4')).toEqual([3, 4])
    expect(issueReferences('FIXED #9')).toEqual([9])
  })

  it('accepts a full URL, but only into this repository', () => {
    expect(
      issueReferences('Closes https://github.com/AryeBorgen/pr-radar/issues/7', 'AryeBorgen/pr-radar'),
    ).toEqual([7])
    expect(
      issueReferences('Closes https://github.com/someone/else/issues/7', 'AryeBorgen/pr-radar'),
    ).toEqual([])
  })

  it('accepts a reference that does not close, for work spanning several pulls', () => {
    // Found the first time the rule met a real multi-part change. A feature
    // tracked by one issue and delivered over four pull requests can only put
    // `Fixes` on the last of them; the others would close the issue covering
    // the work still to come. The rule exists to require context, and a
    // reference supplies it.
    expect(issueReferences('Refs #26')).toEqual([26])
    expect(issueReferences('Part of #26')).toEqual([26])
    expect(issueReferences('Towards #26')).toEqual([26])
    // Tense is not a distinction worth making: "relates to" and "related to"
    // mean the same thing to the person typing them.
    expect(issueReferences('Related to #26')).toEqual([26])
  })

  it('still ignores a bare mention', () => {
    // `#12` on its own appears in prose all the time -- "see #12 for
    // background", a quoted error message, a version number. Requiring a word
    // in front of it is what separates a claim of intent from an accident.
    expect(issueReferences('see #12 for background')).toEqual([])
    expect(issueReferences('the #12 in that list')).toEqual([])
  })

  it('ignores a reference inside a code block or a quote', () => {
    expect(issueReferences('```\nFixes #12\n```')).toEqual([])
    expect(issueReferences('> Fixes #12')).toEqual([])
  })

  it('copes with an empty body', () => {
    expect(issueReferences('')).toEqual([])
    expect(issueReferences(null)).toEqual([])
  })
})

describe('templateHeadings', () => {
  it('reads the headings a form will produce out of the form itself', () => {
    const form = `
name: Bug report
body:
  - type: markdown
    attributes:
      value: preamble that produces no heading
  - type: textarea
    id: what
    attributes:
      label: What happened
  - type: dropdown
    id: how
    attributes:
      label: How are you running it
`
    expect(templateHeadings(form)).toEqual(['What happened', 'How are you running it'])
  })

  it('ignores the labels of checkbox options', () => {
    // An option's label sits under `options:` as a list item and never becomes a
    // heading. A folded scalar there was being read as a heading called ">".
    const form = `
body:
  - type: textarea
    attributes:
      label: What happened
  - type: checkboxes
    attributes:
      label: Scope
      options:
        - label: >
            a long option that wraps
        - label: a short one
`
    expect(templateHeadings(form)).toEqual(['What happened', 'Scope'])
  })

  it('returns nothing for a form with no fields', () => {
    expect(templateHeadings('name: Empty\nbody: []\n')).toEqual([])
  })
})

describe('verdict', () => {
  const headings = [['What happened', 'How are you running it'], ['What are you trying to find out']]
  const filled = '### What happened\n\nThe list is empty.\n\n### How are you running it\n\nDocker\n'

  /** The reason a verdict rejected, failing loudly if it did not reject at all. */
  function why(issue: { state: string; body: string | null } | null): string {
    const result = verdict({ issue, headings })
    if (result.ok) throw new Error('expected a rejection, got acceptance')
    return result.reason
  }

  it('accepts a pull request that closes an open, templated issue', () => {
    expect(verdict({ issue: { state: 'open', body: filled }, headings })).toEqual({ ok: true })
  })

  it('rejects an issue that is already closed', () => {
    expect(why({ state: 'closed', body: filled })).toMatch(/closed/i)
  })

  it('rejects an issue opened without a template', () => {
    // The case this exists for: a two-word issue opened only to satisfy the check.
    expect(why({ state: 'open', body: 'it is broken' })).toMatch(/template/i)
  })

  it('rejects a templated issue whose sections were emptied out', () => {
    expect(why({ state: 'open', body: '### What happened\n\n\n### How are you running it\n\n' })).toMatch(
      /empty/i,
    )
  })

  it('accepts either template, not only the first', () => {
    const idea = { state: 'open', body: '### What are you trying to find out\n\nWhich are stale.\n' }
    expect(verdict({ issue: idea, headings })).toEqual({ ok: true })
  })

  it('rejects a missing issue', () => {
    expect(why(null)).toMatch(/does not exist/i)
  })
})

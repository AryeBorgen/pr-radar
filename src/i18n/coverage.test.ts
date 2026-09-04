import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Two things this project has already got wrong once each, now checked.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('the test suite itself', () => {
  // `include` was 'src/**/*.test.ts', and a `.test.tsx` file sat in the tree
  // being collected by nothing: ten tests passing by never running. A suite
  // that silently skips a file is worse than one that fails, because it reports
  // success.
  it('collects every test file that exists', async () => {
    const onDisk = walk('src').filter((p) => /\.test\.tsx?$/.test(p)).sort()
    const { default: config } = await import('../../vite.config')
    const patterns = (config as { test?: { include?: string[] } }).test?.include ?? []

    for (const file of onDisk) {
      const extension = file.endsWith('.tsx') ? 'tsx' : 'ts'
      expect(
        patterns.some((p) => p.endsWith(`.test.${extension}`)),
        `${file} matches no pattern in vite.config.ts test.include`,
      ).toBe(true)
    }
  })
})

/**
 * A string typed straight into a component is invisible to translation: it
 * renders in English to a Hebrew reader and nothing anywhere reports it. This
 * reads the components and looks for prose that never reached a catalogue.
 *
 * Deliberately crude, and deliberately allowlisted where it is wrong: a
 * heuristic that cannot be overridden gets disabled the first time it is, and
 * then it is not a check at all.
 */
describe('no untranslated text in a component', () => {
  /** Text that is not prose, or that is the same in every language. */
  const ALLOWED = new Set([
    'PR Radar', 'GitHub', 'ghp_', 'github_pat_', 'api.github.com',
    'sessionStorage', 'localStorage', 'repo', 'read:org',
    // Identifiers and protocol constants, not prose.
    'GitHubError', 'Promise', 'Content-Type', 'Authorization', 'Accept',
    // KeyboardEvent.key values. Named by the platform, never shown to anyone.
    'Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'Backspace',
  ])

  /*
   * Any English word rendered to a reader, not just a sentence.
   *
   * This asked for two words or more at first, and a button labelled "Add"
   * shipped in English on a Hebrew page -- visible in a screenshot, invisible
   * to the check that existed to prevent exactly that. A single word is the
   * easiest thing to forget and the easiest thing to miss.
   */
  const looksTranslatable = (text: string) =>
    /^[A-Za-z][A-Za-z'’]/.test(text.trim()) &&
    !text.includes('pr:') &&
    !text.includes('://') &&
    // Not a screaming-case constant.
    !/^[A-Z_]+$/.test(text.trim()) &&
    // And not code that happened to sit between a `>` and a `<`. A comparison,
    // a ternary, or a generic type parameter looks exactly like tag text to a
    // regex, so anything carrying the punctuation of an expression or a
    // declaration is skipped -- as is anything spanning a line, since a
    // rendered label never does.
    !/[(){}=;:[\]]|\.[a-z]/.test(text) &&
    !text.includes('\n')

  it('every component renders through the catalogue', () => {
    const offenders: string[] = []

    /*
     * `src/lib` too, and that is not a nicety.
     *
     * The filter axes and the dropdown menus are data: arrays of `{ id, label,
     * query }` in facets.ts and menus.ts. They render forty-odd words to every
     * reader, and they were all still English on a Hebrew page long after the
     * components were translated -- because this check read components and
     * those are not components. It went unnoticed until a screenshot.
     *
     * Their labels are now MessageKey rather than string, so the compiler
     * catches a key that does not exist. This catches a string that never
     * became a key at all.
     */
    for (const file of walk('src/components').concat(walk('src/lib'), ['src/App.tsx'])) {
      if (!/\.tsx?$/.test(file) || file.includes('.test.')) continue
      const source = readFileSync(file, 'utf8')

      // Strip comments and imports before looking: the prose in a comment is
      // for a developer, and this project has a great deal of it.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^import .*$/gm, '')

      /*
       * Three places text reaches a reader, and all three have been missed
       * once. Between tags is the obvious one. Props like `aria-label` are
       * read aloud rather than seen. And a string literal inside an expression
       * -- `{busy ? 'Looking up…' : 'Add'}` -- is invisible to a check that
       * only looks between tags, which is how an English "Add" shipped on a
       * Hebrew page.
       */
      const expressions = code
        .replace(/className=\{[^}]*\}/g, '')
        .replace(/className="[^"]*"/g, '')
      const candidates = [
        ...[...code.matchAll(/>\s*([A-Za-z][^<>{}]{1,}?)\s*</g)].map((m) => m[1]),
        ...[...code.matchAll(/(?:aria-label|title|placeholder|alt)=["']([^"']{4,})["']/g)].map((m) => m[1]),
        ...[...expressions.matchAll(/\{[^{}]*?['"]([A-Z][^'"]{1,60})['"][^{}]*?\}/g)].map((m) => m[1]),
      ]

      for (const text of candidates) {
        if (text === undefined) continue
        const trimmed = text.trim()
        if (ALLOWED.has(trimmed) || !looksTranslatable(trimmed)) continue
        offenders.push(`${file}: ${trimmed.slice(0, 60)}`)
      }
    }

    expect(
      offenders,
      'these read as English typed into a component rather than looked up:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })
})

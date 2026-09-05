import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every Tailwind class carries the `pr:` prefix.
 *
 * The stylesheet is prefixed so it cannot collide with a host's, which means an
 * unprefixed class is not a class at all -- it matches nothing and renders
 * nothing. There is no error, no warning and no missing element: the rule is
 * simply absent.
 *
 * Eight of them shipped. All eight were in the `selected` branch of a ternary
 * inside a template literal, which is the one place the earlier conversion did
 * not reach, and every one of them was a state most screenshots do not show --
 * the highlighted filter pill, the active dropdown. The bug was live for days
 * and nothing failed.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Tailwind utilities this project uses. Enough to recognise a class list. */
const UTILITY =
  /\b(bg|text|border|ring|font|rounded|px|py|pt|pb|ps|pe|ms|me|mt|mb|mx|my|w|h|gap|shadow|opacity|space|divide|min|max|z|tracking|leading|italic|underline|truncate|tabular|shrink|grow|flex|grid|items|justify|self|absolute|relative|inline|block|hidden|transition)-[a-z0-9./[\]%-]+/

describe('the prefixed stylesheet', () => {
  it('has no class that the prefix would have dropped', () => {
    const offenders: string[] = []

    for (const file of walk('src')) {
      if (!file.endsWith('.tsx') || file.includes('.test.')) continue
      const source = readFileSync(file, 'utf8')

      // Only inside a className expression. A word like `text-decoration` in a
      // comment is not a class, and neither is a query fragment.
      for (const block of source.matchAll(/className=\{`(?:[^`]|\\`)*`\}|className=\{[^}]*\}/g)) {
        for (const quoted of block[0].matchAll(/'([^']*)'|"([^"]*)"/g)) {
          const text = quoted[1] ?? quoted[2] ?? ''
          if (!text.trim() || text.includes('pr:')) continue
          if (UTILITY.test(text)) offenders.push(`${file}: ${text.slice(0, 70)}`)
        }
      }
    }

    expect(
      offenders,
      'these look like Tailwind classes without the pr: prefix, so they render nothing:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })
})

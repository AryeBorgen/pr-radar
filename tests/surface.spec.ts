import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * The published surface, pinned.
 *
 * Freezing the contract is the cost of publishing at all, so the contract should
 * be something visible in a diff rather than something discovered afterwards.
 * Two checks: the names, and the shapes. A new export trips the first; a field
 * turning optional or a return type widening trips the second.
 *
 * If one of these fails and the change was deliberate, update the list below in
 * the same commit. That edit is the record that the contract moved.
 */

// `Locale` joined this list when the radar learned Hebrew: a host that renders
// the panel in a language needs the type of the value it passes. Deliberate,
// and additive -- see the snapshot diff in the same commit.
const EXPECTED = ['Locale', 'RadarHandle', 'RadarOptions', 'RepoRef', 'renderRadar'].sort()

test('the library exports exactly what it promises', async () => {
  const declaration = readFileSync('dist-lib/types/render.d.ts', 'utf8')

  const exported = [
    ...declaration.matchAll(/export (?:declare )?(?:function|const|interface|type|class) (\w+)/g),
  ].map((m) => m[1])
  const reExported = [...declaration.matchAll(/export type \{ ([^}]+) \}/g)].flatMap((m) =>
    (m[1] ?? '').split(',').map((n) => n.trim()),
  )

  expect([...new Set([...exported, ...reExported])].filter(Boolean).sort()).toEqual(EXPECTED)
})

test('no internal type reaches the surface', async () => {
  const declaration = readFileSync('dist-lib/types/render.d.ts', 'utf8')

  // These are the ones the architecture depends on being free to change.
  // PullRequest in particular is what changed when the data layer moved from
  // GraphQL to REST, in a rewrite that touched one module.
  for (const internal of ['PullRequest', 'Enrichment', 'Settings', 'Selection', 'MenuSelection']) {
    expect(declaration, `${internal} must not appear in the public declaration`).not.toContain(
      internal,
    )
  }
})

test('the declaration carries no any', async () => {
  const declaration = readFileSync('dist-lib/types/render.d.ts', 'utf8')
  // An `any` in a .d.ts is a hole in the contract that nothing else here notices.
  expect(declaration).not.toMatch(/\bany\b/)
})

test('the package points at files that exist', async () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  for (const [name, entry] of Object.entries(pkg.exports as Record<string, unknown>)) {
    const paths = typeof entry === 'string' ? [entry] : Object.values(entry as Record<string, string>)
    for (const path of paths) {
      expect(() => readFileSync(path.replace(/^\.\//, '')), `${name} -> ${path}`).not.toThrow()
    }
  }
})

/**
 * The whole declaration, byte for byte.
 *
 * The tests above ask questions someone thought to ask. This one asks nothing
 * and notices everything -- a widened return type, a lost `readonly`, a doc
 * comment that now describes behaviour the code no longer has. Its real job is
 * in review: a change to the public API shows up as a diff of this file, in the
 * same pull request as the change, where a reviewer can see it.
 *
 * To update: `npm run build:lib && cp dist-lib/types/render.d.ts
 * tests/render.d.ts.snapshot`. Do it in the commit that moves the contract, and
 * say in the message why the contract moved.
 */
test('the declaration matches the checked-in snapshot', async () => {
  const built = readFileSync('dist-lib/types/render.d.ts', 'utf8')
  const snapshot = readFileSync('tests/render.d.ts.snapshot', 'utf8')

  expect(built, 'the public API changed -- see the note above this test').toBe(snapshot)
})

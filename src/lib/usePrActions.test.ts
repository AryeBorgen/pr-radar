import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LIST_KEY } from './usePrActions'

describe('the cache key the optimistic update writes through', () => {
  /*
   * A typo here would make every optimistic update silently do nothing.
   *
   * `setQueriesData` matches a prefix; a key that matches nothing is not an
   * error, it is a no-op. The only symptom would be a row that takes until the
   * next poll to change, which reads as slowness rather than as a bug -- and a
   * row that has not changed is a row somebody clicks again.
   */
  it('is the one usePrRadar actually caches under', () => {
    const source = readFileSync('src/lib/usePrRadar.ts', 'utf8')
    const keys = [...source.matchAll(/queryKey:\s*\[\s*'([^']+)'/g)].map((m) => m[1])

    expect(keys, 'usePrRadar declares no query keys at all').not.toHaveLength(0)
    expect(
      keys,
      `usePrActions writes through '${LIST_KEY}', which usePrRadar does not use`,
    ).toContain(LIST_KEY)
  })
})

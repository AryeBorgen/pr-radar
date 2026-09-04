import { describe, expect, it } from 'vitest'
import { suggestOwners } from './github'

/**
 * Typing an owner that turns out to be empty is a dead end unless the app can
 * say what to try instead. These are the shapes that actually get typed.
 */
describe('suggestOwners', () => {
  const mine = ['DePointLTD', 'Bizi-IL', 'Home-SH-IL', 'Buildix-IL', 'CivikaHQ']

  it('offers the organisation someone was reaching for by prefix', () => {
    // The case that sent this feature: "DePoint" is a real but unrelated GitHub
    // user, so the lookup succeeded, returned nothing, and said so.
    expect(suggestOwners('DePoint', mine)).toEqual(['DePointLTD'])
  })

  it('ignores case', () => {
    expect(suggestOwners('BIZI', mine)).toEqual(['Bizi-IL'])
    expect(suggestOwners('civika', mine)).toEqual(['CivikaHQ'])
  })

  it('does not offer back the exact name, whatever its case', () => {
    // Someone who typed the right name and still saw nothing is not helped by
    // being told to type it again. GitHub matches owner names case-insensitively
    // anyway, so this path is only reached when the name really was wrong.
    expect(suggestOwners('depointltd', mine)).toEqual([])
    expect(suggestOwners('DePointLTD', mine)).toEqual([])
  })

  it('matches on a fragment, not only a prefix', () => {
    expect(suggestOwners('SH', mine)).toEqual(['Home-SH-IL'])
  })

  it('returns every plausible match rather than guessing between them', () => {
    expect(suggestOwners('IL', mine)).toEqual(['Bizi-IL', 'Home-SH-IL', 'Buildix-IL'])
  })

  it('says nothing when nothing is close, rather than offering noise', () => {
    expect(suggestOwners('facebook', mine)).toEqual([])
  })

  it('does not suggest the thing that was just typed', () => {
    expect(suggestOwners('CivikaHQ', mine)).toEqual([])
  })

  it('copes with an empty list and an empty query', () => {
    expect(suggestOwners('anything', [])).toEqual([])
    expect(suggestOwners('', mine)).toEqual([])
  })
})

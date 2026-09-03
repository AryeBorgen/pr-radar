import { describe, expect, it } from 'vitest'
import { parseRepoInput, repoKey } from './storage'

describe('parseRepoInput', () => {
  it('accepts owner/name', () => {
    expect(parseRepoInput('acme/web')).toEqual({ owner: 'acme', name: 'web' })
  })

  it('accepts a browser URL', () => {
    expect(parseRepoInput('https://github.com/acme/web')).toEqual({ owner: 'acme', name: 'web' })
    expect(parseRepoInput('https://github.com/acme/web/')).toEqual({ owner: 'acme', name: 'web' })
  })

  it('accepts an ssh remote', () => {
    expect(parseRepoInput('git@github.com:acme/web.git')).toEqual({ owner: 'acme', name: 'web' })
  })

  it('rejects anything that is not a single repository', () => {
    expect(parseRepoInput('acme')).toBeNull()
    expect(parseRepoInput('acme/web/tree/main')).toBeNull()
    expect(parseRepoInput('')).toBeNull()
  })

  it('keys case-insensitively so a repo cannot be added twice', () => {
    expect(repoKey({ owner: 'Acme', name: 'Web' })).toBe(repoKey({ owner: 'acme', name: 'web' }))
  })
})

import { describe, expect, it } from 'vitest'
import { introSeen, markIntroSeen, parseRepoInput, repoKey, saveSettings } from './storage'

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

describe('the introduction flag', () => {
  // These tests run under node, which has no localStorage. A few lines of
  // in-memory store is enough: what is being checked is this module's own
  // behaviour around the store, including how it fails when there is none.
  function withStore(store: Record<string, string> | null, body: () => void) {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value:
        store === null
          ? undefined
          : {
              getItem: (k: string) => (k in store ? store[k] : null),
              setItem: (k: string, v: string) => {
                store[k] = v
              },
              removeItem: (k: string) => {
                delete store[k]
              },
            },
    })
    try {
      body()
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original)
      else Reflect.deleteProperty(globalThis, 'localStorage')
    }
  }

  it('is false until it is set', () => {
    withStore({}, () => expect(introSeen()).toBe(false))
  })

  it('is true once marked', () => {
    withStore({}, () => {
      markIntroSeen()
      expect(introSeen()).toBe(true)
    })
  })

  it('outlives the settings, which are cleared independently', () => {
    // Not in the settings blob on purpose: someone resetting their repositories
    // should not be introduced to the application again.
    const store: Record<string, string> = {}
    withStore(store, () => {
      markIntroSeen()
      saveSettings({ repos: [], views: [], refreshInterval: 120 })
      delete store['pr-radar.settings.v1']
      expect(introSeen()).toBe(true)
    })
  })

  it('shows the introduction again rather than throwing when there is no store', () => {
    withStore(null, () => {
      expect(introSeen()).toBe(false)
      expect(() => markIntroSeen()).not.toThrow()
    })
  })
})

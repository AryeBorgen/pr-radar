import { describe, expect, it } from 'vitest'
import {
  introSeen,
  loadCredential,
  loadStaySignedIn,
  markIntroSeen,
  parseRepoInput,
  repoKey,
  saveCredential,
  saveSettings,
  saveStaySignedIn,
} from './storage'

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

/**
 * Where the session is kept, and the one rule that holds it together.
 *
 * A user reported that the token "was not saved". It was not a bug -- the token
 * lives in sessionStorage deliberately -- but the behaviour it produces is
 * genuinely confusing: a window the *page* opens inherits the tab's session and
 * one the *person* opens does not, so the app appears to remember them
 * sometimes and not others, with nothing visible to explain the difference.
 *
 * So the choice is offered. The invariant that makes it safe is that the
 * credential is written to exactly one store and cleared from the other -- a
 * forgotten copy is what turns "I signed out" and "I unticked the box" into
 * false statements.
 */
describe('where the session is kept', () => {
  const TOKEN = 'pr-radar.token.v1'
  const credential = { token: 'ghp_x' }

  function clear() {
    sessionStorage.clear()
    localStorage.clear()
  }

  it('keeps it in the tab by default, which is the long-standing behaviour', () => {
    clear()

    saveCredential(credential)

    expect(sessionStorage.getItem(TOKEN)).not.toBeNull()
    expect(localStorage.getItem(TOKEN)).toBeNull()
  })

  it('keeps it on the device when asked', () => {
    clear()

    saveCredential(credential, true)

    expect(localStorage.getItem(TOKEN)).not.toBeNull()
    expect(sessionStorage.getItem(TOKEN)).toBeNull()
  })

  it('is never in both places at once, whichever way the choice moves', () => {
    // The invariant. Both directions, because a copy left behind by *either*
    // transition is a credential somewhere the person believes it is not.
    clear()

    saveCredential(credential)
    saveCredential(credential, true)
    expect(sessionStorage.getItem(TOKEN)).toBeNull()

    saveCredential(credential, false)
    expect(localStorage.getItem(TOKEN)).toBeNull()
    expect(sessionStorage.getItem(TOKEN)).not.toBeNull()
  })

  it('signing out empties both, not just the one in use', () => {
    // Otherwise "sign out" leaves the credential on disk for the next person at
    // the machine -- the exact case the tab-scoped default exists to protect.
    clear()
    saveCredential(credential, true)

    saveCredential(null, false)

    expect(localStorage.getItem(TOKEN)).toBeNull()
    expect(sessionStorage.getItem(TOKEN)).toBeNull()
  })

  it('reads back a session kept on the device', () => {
    clear()
    saveCredential({ token: 'ghp_x', refreshToken: 'ghr_y' }, true)

    expect(loadCredential()).toEqual({ token: 'ghp_x', refreshToken: 'ghr_y' })
  })

  it('remembers the choice itself across tabs, since that is its whole job', () => {
    clear()
    expect(loadStaySignedIn()).toBe(false)

    saveStaySignedIn(true)
    expect(loadStaySignedIn()).toBe(true)
    expect(localStorage.getItem('pr-radar.stay.v1')).toBe('yes')

    saveStaySignedIn(false)
    expect(loadStaySignedIn()).toBe(false)
  })
})

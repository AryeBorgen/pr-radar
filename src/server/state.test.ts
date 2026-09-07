// @vitest-environment node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { STATE_FILE, loadState, saveState, stateDir, tooOpen, type ServerState } from './state'

/**
 * The file that holds a GitHub token.
 *
 * The first thing this project has ever written to disk that is worth stealing,
 * so these are about the properties that make that acceptable rather than about
 * round-tripping JSON: nobody else can read it, a half-written file cannot
 * replace a good one, and a file that *is* readable by others is refused rather
 * than quietly repaired.
 */

const onWindows = process.platform === 'win32'
const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pr-radar-state-'))
  dirs.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const withToken = (token: string): ServerState => ({
  credential: { token },
  vapid: null,
  subscriptions: [],
  notified: {},
})

describe('where it lives', () => {
  it('prefers an explicit directory, then the environment, then XDG', () => {
    // A container points --state-dir at a volume; without it every `docker run`
    // would sign in again.
    const home = '/home/someone'
    expect(stateDir({ arg: '/data', env: {}, home })).toBe('/data')
    expect(stateDir({ env: { PR_RADAR_STATE_DIR: '/data' }, home })).toBe('/data')
    expect(stateDir({ env: { XDG_STATE_HOME: '/x' }, home })).toBe(join('/x', 'pr-radar'))
    expect(stateDir({ env: {}, home })).toBe(join(home, '.local', 'state', 'pr-radar'))
  })
})

describe('the permissions', () => {
  it('calls any access beyond the owner too open', () => {
    expect(tooOpen(0o600)).toBe(false)
    expect(tooOpen(0o640)).toBe(true)
    expect(tooOpen(0o604)).toBe(true)
    expect(tooOpen(0o666)).toBe(true)
  })

  it.skipIf(onWindows)('writes a file only the owner can read', () => {
    const file = saveState(scratch(), withToken('ghp_secret'))

    expect(statSync(file).mode & 0o777).toBe(0o600)
  })

  it.skipIf(onWindows)('refuses to read a file other users can read', () => {
    /*
     * Refusing, not repairing. A file that was readable by everybody may
     * already have been read, and tightening the mode silently would hide the
     * one fact its owner needs: that the token should be revoked.
     */
    const dir = scratch()
    saveState(dir, withToken('ghp_secret'))
    chmodSync(join(dir, STATE_FILE), 0o644)

    expect(() => loadState(dir)).toThrow(/readable by other users/)
    expect(() => loadState(dir)).toThrow(/revoke it/)
  })

  it.skipIf(onWindows)('does not inherit the mode of a temporary left by a crash', () => {
    // `writeFileSync`'s mode is ignored when the file already exists, so a
    // leftover 0644 temporary would be filled with a token and keep its mode.
    // That is why saveState chmods as well as creating.
    const dir = scratch()
    mkdirSync(dir, { recursive: true })
    const temporary = join(dir, `.${STATE_FILE}.${process.pid}.tmp`)
    writeFileSync(temporary, 'left over')
    chmodSync(temporary, 0o644)

    const file = saveState(dir, withToken('ghp_secret'))

    expect(statSync(file).mode & 0o777).toBe(0o600)
  })
})

describe('reading it back', () => {
  it('round-trips what was written', () => {
    const dir = scratch()
    const state: ServerState = {
      credential: { token: 'ghp_x', refreshToken: 'r' },
      vapid: { publicKey: { x: 'a' }, privateKey: { d: 'b' } },
      subscriptions: [
        { endpoint: 'https://push.example/1', repos: [{ owner: 'a', name: 'b' }], enabled: {}, headlines: {} },
      ],
      notified: { abc: { seen: ['a/b#1'], matched: {} } },
    }

    saveState(dir, state)

    expect(loadState(dir)).toEqual(state)
  })

  it('treats a first run as empty rather than an error', () => {
    expect(loadState(scratch())).toEqual({
      credential: null,
      vapid: null,
      subscriptions: [],
      notified: {},
    })
  })

  it('survives a hand-edited or truncated file', () => {
    // The same defensiveness src/lib/storage.ts applies to localStorage, for
    // the same reason: this is on disk and editable.
    const dir = scratch()
    saveState(dir, withToken('ghp_x'))
    writeFileSync(join(dir, STATE_FILE), '{"credential": {"token', { mode: 0o600 })

    expect(loadState(dir).subscriptions).toEqual([])
  })

  it('repairs a subscriptions field that is not a list', () => {
    const dir = scratch()
    writeFileSync(join(dir, STATE_FILE), JSON.stringify({ subscriptions: 'all of them' }), {
      mode: 0o600,
    })

    expect(loadState(dir).subscriptions).toEqual([])
  })
})

describe('the write itself', () => {
  it('replaces the file atomically, so a crash cannot truncate it', () => {
    // Checked by what is left behind: after a successful write there is exactly
    // one file, which is only true if the temporary was renamed over the target
    // rather than written in place.
    const dir = scratch()
    saveState(dir, withToken('first'))
    saveState(dir, withToken('second'))

    expect(readdirSync(dir)).toEqual([STATE_FILE])
    expect(JSON.parse(readFileSync(join(dir, STATE_FILE), 'utf8')).credential.token).toBe('second')
  })
})

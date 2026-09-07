/**
 * The only file this project writes that is worth protecting.
 *
 * Everything pr-radar keeps normally lives in a browser, which is most of the
 * argument for it having no attack surface. Push cannot work that way: something
 * has to be awake and holding a GitHub token while the tab is closed. That is a
 * real cost, so it is paid in one visible place rather than spread around, and
 * none of it happens unless `--push` is passed.
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'
import type { NotifyState } from '../lib/notifications'
import type { RepoRef } from '../types'
import type { VapidKeys } from './vapid'

export const STATE_FILE = 'state.json'

/** What a browser asked us to watch on its behalf. */
export interface Subscription {
  /**
   * The address to ring, and deliberately the only thing kept about a browser.
   * A subscription also offers `p256dh` and `auth`, which are what RFC 8291
   * needs to encrypt a payload -- this never sends one, so storing them would
   * be keeping a capability the design has decided not to have.
   */
  endpoint: string
  repos: RepoRef[]
  enabled: Record<string, boolean>
  /** The words to show, in the language of the browser that subscribed. */
  headlines: Record<string, string>
}

export interface ServerState {
  /** Present only when the server signed in itself; `--token` writes nothing. */
  credential: { token: string; refreshToken?: string; expiresAt?: number } | null
  vapid: VapidKeys | null
  subscriptions: Subscription[]
  /** The last announced baseline, per subscription, so a restart is quiet. */
  notified: Record<string, NotifyState>
  /** The login the token belongs to, used to resolve `@me` in the rules. */
  viewer?: string
}

/**
 * Where the state lives.
 *
 * `XDG_STATE_HOME` first because that is what it is for. A container points
 * `--state-dir` at a volume; without that, every `docker run` would sign in
 * again.
 */
export function stateDir({
  arg,
  env = process.env,
  home = homedir(),
}: { arg?: string; env?: NodeJS.ProcessEnv; home?: string } = {}): string {
  if (arg) return arg
  if (env.PR_RADAR_STATE_DIR) return env.PR_RADAR_STATE_DIR
  if (env.XDG_STATE_HOME) return join(env.XDG_STATE_HOME, 'pr-radar')
  return join(home, '.local', 'state', 'pr-radar')
}

/**
 * Whether a mode lets anybody but the owner read the file.
 *
 * Separate from the check that uses it so it can be tested without creating a
 * world-readable file with a credential in it, which is a silly thing to leave
 * lying around a test directory.
 */
export function tooOpen(mode: number): boolean {
  return (mode & 0o077) !== 0
}

function empty(): ServerState {
  return { credential: null, vapid: null, subscriptions: [], notified: {} }
}

export class StateTooOpenError extends Error {}

/**
 * Read the state, refusing to use a file other users can read.
 *
 * Refusing rather than repairing. A file that was readable by everybody may
 * already have been read, and quietly tightening the mode would hide the one
 * fact its owner needs to act on. On Windows the mode bits do not describe
 * access, so the check does not run there rather than pretending to.
 */
export function loadState(dir: string): ServerState {
  const file = join(dir, STATE_FILE)
  let raw: string
  try {
    if (platform() !== 'win32' && tooOpen(statSync(file).mode)) {
      throw new StateTooOpenError(
        `pr-radar: ${file} is readable by other users and holds a GitHub token.\n` +
          `Fix it with:  chmod 600 ${file}\n` +
          'Refusing to use it until then. If the token has been exposed, revoke it first.',
      )
    }
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if (error instanceof StateTooOpenError) throw error
    // Missing is the normal first run.
    return empty()
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ServerState>
    // Defensive in the same spirit as src/lib/storage.ts, for the same reason:
    // this is on disk, hand-editable, and may have been written by an older
    // version of this program.
    return {
      ...empty(),
      ...parsed,
      subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
      notified:
        parsed.notified && typeof parsed.notified === 'object' ? parsed.notified : {},
    }
  } catch {
    return empty()
  }
}

/**
 * Write the state so that only its owner can read it.
 *
 * Through a temporary file and a rename, because a crash halfway through a
 * write would otherwise leave something truncated -- and the recovery from that
 * is to throw the credential away and sign in again.
 *
 * The mode is set as the temporary is created *and* again afterwards:
 * `writeFileSync`'s mode is ignored when the file already exists, so a leftover
 * temporary from a crashed run would otherwise be filled with a token and keep
 * whatever mode it had.
 */
export function saveState(dir: string, state: ServerState): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const file = join(dir, STATE_FILE)
  const temporary = join(dir, `.${STATE_FILE}.${process.pid}.tmp`)

  writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600 })
  chmodSync(temporary, 0o600)
  renameSync(temporary, file)
  return file
}

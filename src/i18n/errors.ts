import type { Translator } from './translate'
import { en } from './en'
import type { MessageKey } from './en'

/**
 * Turning a thrown error into words the reader can read.
 *
 * The data layer throws keys, because it has no translator and building a
 * sentence there would render English to a Hebrew reader. Some errors are not
 * ours at all, though -- a message from `fetch`, or from a browser extension --
 * and those are shown as they arrived rather than swallowed. Showing a raw key
 * to a reader would be worse than either.
 */

function isKey(value: string): value is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, value)
}

/** Translate a key with values, where the values may themselves be keys. */
export function messageForKey(
  t: Translator,
  message: string,
  values: Readonly<Record<string, string | number>> | undefined,
  fallback: MessageKey,
): string {
  if (!isKey(message)) return message || t(fallback)
  // Some of our own messages interpolate a value that is itself a key --
  // "resets at shortly" -- so values are translated before being substituted.
  const resolved: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(values ?? {})) {
    resolved[name] = typeof value === 'string' && isKey(value) ? t(value) : value
  }
  return (t as (k: string, v?: unknown) => string)(message, resolved)
}

export function messageFor(t: Translator, cause: unknown, fallback: MessageKey): string {
  if (!(cause instanceof Error)) return t(fallback)

  const values = (cause as { values?: Readonly<Record<string, string | number>> }).values

  if (isKey(cause.message)) {
    // Some of our own messages interpolate a value that is itself a key --
    // "resets at shortly" -- so the values are translated before they are
    // substituted.
    const resolved: Record<string, string | number> = {}
    for (const [name, value] of Object.entries(values ?? {})) {
      resolved[name] = typeof value === 'string' && isKey(value) ? t(value) : value
    }
    return (t as (k: string, v?: unknown) => string)(cause.message, resolved)
  }

  // Not one of ours. `fetch` and browser extensions produce messages worth
  // showing verbatim, in whatever language they came in.
  return cause.message || t(fallback)
}

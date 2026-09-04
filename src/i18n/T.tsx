import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { useLocale } from './useLocale'
import { translate } from './translate'
import type { MessageKey, Messages } from './en'
import type { Values } from './types'

/**
 * A message with markup inside it.
 *
 * Some sentences have a link or an emphasis in the middle, and the three ways
 * to handle that are all worse than this one. Splitting the sentence into
 * fragments assumes every language puts the pieces in the same order, which is
 * the assumption right-to-left breaks first. Putting HTML in the message means
 * parsing translator-supplied markup and rendering it, which is an injection
 * waiting for one careless catalogue edit. And leaving the markup out flattens
 * the writing.
 *
 * So the message carries numbered slots -- `<1>you</1>` -- and the call site
 * supplies the elements. The text inside the slot is translated with everything
 * around it, and the element is one this codebase wrote:
 *
 *   'welcome.body': 'waiting on <1>you</1>.'
 *   <T k="welcome.body" parts={{ 1: <strong /> }} />
 *
 * Nothing is parsed as HTML and nothing from a catalogue becomes an element,
 * so a bad translation can produce bad prose but not a script tag.
 */

/** `<1>…</1>`, and the text between. Non-greedy so two slots do not merge. */
const SLOT = /<(\d+)>(.*?)<\/\1>/gs

export function renderParts(
  text: string,
  parts: Readonly<Record<number, ReactElement>>,
): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  let key = 0

  for (const match of text.matchAll(SLOT)) {
    const [whole, index, inner] = match
    const start = match.index
    if (start > at) out.push(text.slice(at, start))

    const element = parts[Number(index)]
    if (element === undefined || !isValidElement(element)) {
      // A slot with no element is a mismatch between a catalogue and a call
      // site. Render the words rather than the markup: the sentence survives,
      // and the missing emphasis is a cosmetic bug instead of a hole.
      out.push(<Fragment key={key++}>{inner}</Fragment>)
    } else {
      out.push(cloneElement(element, { key: key++ }, inner))
    }
    at = start + whole.length
  }

  if (at < text.length) out.push(text.slice(at))
  return out
}

type Props<K extends MessageKey> = {
  k: K
  parts?: Readonly<Record<number, ReactElement>>
} & (Values<Messages[K]> extends void ? { values?: undefined } : { values: Values<Messages[K]> })

export function T<K extends MessageKey>({ k, parts, values }: Props<K>) {
  const { locale } = useLocale()
  const text = translate(locale, k, values as Readonly<Record<string, string | number>> | undefined)
  if (parts === undefined) return <>{text}</>
  return <>{renderParts(text, parts)}</>
}

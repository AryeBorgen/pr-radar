import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderParts } from './T'

const show = (text: string, parts: Parameters<typeof renderParts>[1]) =>
  renderToStaticMarkup(<>{renderParts(text, parts)}</>)

describe('messages with markup in them', () => {
  it('leaves a plain message alone', () => {
    expect(show('nothing to do here', {})).toBe('nothing to do here')
  })

  it('wraps the slot text in the element the call site gave', () => {
    expect(show('waiting on <1>you</1>.', { 1: <strong /> })).toBe(
      'waiting on <strong>you</strong>.',
    )
  })

  it('handles several slots, and keeps them apart', () => {
    expect(show('<1>a</1> and <2>b</2>', { 1: <strong />, 2: <em /> })).toBe(
      '<strong>a</strong> and <em>b</em>',
    )
  })

  it('keeps the element\'s own attributes', () => {
    expect(show('see <1>the docs</1>', { 1: <a href="https://example.com" /> })).toBe(
      'see <a href="https://example.com">the docs</a>',
    )
  })

  // A translator reordering the sentence is the whole point: Hebrew does not
  // put the pieces where English does.
  it('follows the order the translation puts them in', () => {
    expect(show('<2>second</2> then <1>first</1>', { 1: <strong />, 2: <em /> })).toBe(
      '<em>second</em> then <strong>first</strong>',
    )
  })

  // The catalogue is data, and data must never become markup. A translation
  // that contains a tag renders as the words of that tag, visibly wrong rather
  // than invisibly dangerous.
  it('never renders markup that came from a message', () => {
    const html = show('hello <img src=x onerror=alert(1)> there', {})
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('never renders markup inside a slot either', () => {
    const html = show('<1><script>alert(1)</script></1>', { 1: <strong /> })
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  // A mismatch between a catalogue and a call site should cost the emphasis,
  // not the sentence.
  it('renders the words when the call site forgot the element', () => {
    expect(show('waiting on <1>you</1>.', {})).toBe('waiting on you.')
  })

  it('renders the words when the slot number does not match', () => {
    expect(show('waiting on <9>you</9>.', { 1: <strong /> })).toBe('waiting on you.')
  })

  it('leaves an unclosed slot as written, rather than swallowing the rest', () => {
    expect(show('waiting on <1>you', { 1: <strong /> })).toBe('waiting on &lt;1&gt;you')
  })
})

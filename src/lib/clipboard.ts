/**
 * Copying the device code, and admitting when that did not work.
 *
 * The Clipboard API fails in more situations than it looks: an insecure origin,
 * a permission the user has denied, a browser that never implemented it, and --
 * most often on a phone -- a call that has drifted out of the gesture that
 * started it. None of those throw anything a caller would recognise, and a
 * button that silently copied nothing is worse than one that never offered to,
 * because the person is now pasting whatever was in the clipboard before.
 */
export type CopyResult = 'copied' | 'failed'

export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (!navigator.clipboard?.writeText) return 'failed'
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}

/**
 * Start the copy, then open the tab -- in that order, and without awaiting.
 *
 * `window.open` after an `await` is a popup a browser is entitled to block: the
 * gesture that permitted it belongs to the task the click started, and the
 * continuation after an await is a different one. Calling `writeText` does not
 * consume the gesture; awaiting its result does.
 *
 * So the promise is started, the tab is opened in the same task, and the result
 * of the copy is reported afterwards. The tab opens either way, because the
 * code is on screen and a person who has to read it across is still better off
 * with GitHub already in front of them.
 */
export function copyAndOpen(
  text: string,
  url: string,
  open: (url: string) => void = (target) =>
    window.open(target, '_blank', 'noopener,noreferrer'),
): Promise<CopyResult> {
  const copying = copyText(text)
  open(url)
  return copying
}

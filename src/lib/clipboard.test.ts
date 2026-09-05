import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyAndOpen, copyText } from './clipboard'

const withClipboard = (writeText: unknown) => {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  })
}

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
})

describe('copying', () => {
  it('reports success when the clipboard takes it', async () => {
    withClipboard(vi.fn().mockResolvedValue(undefined))
    expect(await copyText('WDJB-MJHT')).toBe('copied')
  })

  // A denied permission, an insecure origin, a call that drifted out of its
  // gesture. None of these are distinguishable to a caller, and all of them
  // leave the previous clipboard contents in place.
  it('reports failure when it is refused', async () => {
    withClipboard(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
    expect(await copyText('WDJB-MJHT')).toBe('failed')
  })

  it('reports failure where there is no clipboard at all', async () => {
    withClipboard(undefined)
    expect(await copyText('WDJB-MJHT')).toBe('failed')
  })

  it('never throws, whatever the platform does', async () => {
    withClipboard(() => {
      throw new Error('synchronous, which the spec does not promise against')
    })
    await expect(copyText('x')).resolves.toBe('failed')
  })
})

describe('copying and opening together', () => {
  /*
   * The ordering this function exists for. `window.open` after an `await` is a
   * popup the browser is entitled to block, because the gesture belongs to the
   * task the click started and the continuation is a different one. Asserted by
   * checking the tab opened before the copy settled.
   */
  it('opens the tab before waiting for the copy to finish', async () => {
    let resolveCopy: () => void = () => {}
    withClipboard(() => new Promise<void>((r) => (resolveCopy = r)))
    const opened: string[] = []

    const running = copyAndOpen('CODE', 'https://github.com/login/device', (url) => opened.push(url))

    expect(opened, 'the tab must open in the same task as the click').toEqual([
      'https://github.com/login/device',
    ])
    resolveCopy()
    expect(await running).toBe('copied')
  })

  // The code is on screen. Somebody who has to read it across is still better
  // off with GitHub already in front of them than with neither.
  it('opens the tab even when the copy fails', async () => {
    withClipboard(vi.fn().mockRejectedValue(new Error('no')))
    const opened: string[] = []

    expect(await copyAndOpen('CODE', 'https://github.com/login/device', (url) => opened.push(url)))
      .toBe('failed')
    expect(opened).toHaveLength(1)
  })
})

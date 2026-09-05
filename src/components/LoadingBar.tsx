import { useEffect, useRef, useState } from 'react'
import { DELAY_MS, shouldShow } from '../lib/progress'
import { useT } from '../i18n/useLocale'

/**
 * A two-pixel line across the top, and nothing else.
 *
 * Chosen over a counter, a ring and a set of skeleton rows because it is the
 * only one that says "still working" without taking any room to say it: no
 * layout shift, no number competing with the counts the page is already full
 * of, nothing to read. You notice it because it moves.
 *
 * It is driven by counts that already existed -- repositories that have
 * answered, pull requests whose review state has arrived -- so it never
 * animates to fill a gap. When there is nothing to report it is not rendered at
 * all, rather than sitting at zero.
 */
export default function LoadingBar({ progress }: { progress: number | null }) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  /** When the current run of work started, for the delay below. */
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (progress === null) {
      startedAt.current = null
      setVisible(false)
      return
    }

    if (startedAt.current === null) startedAt.current = Date.now()
    const running = Date.now() - startedAt.current
    if (shouldShow(progress, running)) {
      setVisible(true)
      return
    }

    /*
     * A poll runs every two minutes and usually finds nothing new. Showing a
     * bar for work that is over in 80ms is a flicker at the top of the screen
     * twice a minute, which is worse than showing nothing -- so the bar waits
     * to see whether the work is real.
     */
    const timer = setTimeout(() => setVisible(true), DELAY_MS - running)
    return () => clearTimeout(timer)
  }, [progress])

  if (!visible || progress === null) return null

  return (
    <div
      // A live region would announce a number changing forty times a second.
      // The bar is decoration over information the page already carries, so it
      // is labelled and left out of the reading order's chatter.
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label={t('loading.label')}
      data-testid="loading-bar"
      className="pr:pointer-events-none pr:fixed pr:inset-x-0 pr:top-0 pr:z-50 pr:h-0.5"
    >
      <div
        className="pr:h-full pr:bg-emerald-600 pr:transition-[width] pr:duration-200 pr:ease-linear pr:dark:bg-emerald-500"
        style={{ width: `${(progress * 100).toFixed(1)}%` }}
      />
    </div>
  )
}

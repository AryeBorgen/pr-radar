import { useEffect, useRef, useState } from 'react'
import { useSlots } from './slots'
import {
  canClose,
  canMerge,
  methodsFor,
  needsConfirmation,
  reference,
  type MergeMethod,
} from '../lib/actions'
import type { PrActions as Actions } from '../lib/usePrActions'
import { useT } from '../i18n/useLocale'
import type { MessageKey } from '../i18n/en'
import type { PullRequest } from '../types'

/**
 * Merging and closing, from the row.
 *
 * The whole design here is about the gap between deciding and doing. This is a
 * dashboard people scan quickly, with rows a few pixels apart, and merging is
 * not undoable. So nothing happens on the first click: the menu opens, and the
 * destructive item opens a confirmation naming the repository and the number.
 *
 * `needsConfirmation` decides which items are destructive, in actions.ts, where
 * it is tested. Reopening asks nothing -- it undoes rather than does.
 */

const METHOD_LABEL: Record<MergeMethod, MessageKey> = {
  merge: 'action.method.merge',
  squash: 'action.method.squash',
  rebase: 'action.method.rebase',
}

export default function PrActions({ pr, actions }: { pr: PullRequest; actions: Actions }) {
  const { Button } = useSlots()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState<{ kind: 'merge' | 'close'; method?: MergeMethod } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Mergeability is asked for when the menu opens, never for a whole list: the
  // list endpoint does not carry it, and two requests per row per poll would
  // dwarf everything else this app spends.
  useEffect(() => {
    if (open) actions.loadMergeability(pr)
  }, [open, pr, actions])

  useEffect(() => {
    if (!open) return
    const away = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
        setConfirming(null)
      }
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Escape backs out of the confirmation first, then the menu. Closing both
      // at once would make an accidental Escape lose the menu as well.
      if (confirming) setConfirming(null)
      else setOpen(false)
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open, confirming])

  const info = actions.mergeability(pr)
  const merge = canMerge(pr, info)
  const close = canClose(pr)
  const busy = actions.busy === pr.id

  const run = (kind: 'merge' | 'close', method?: MergeMethod) => {
    if (kind === 'merge') actions.merge(pr, method ?? 'merge')
    else actions.close(pr)
    setOpen(false)
    setConfirming(null)
  }

  const start = (kind: 'merge' | 'close', method?: MergeMethod) => {
    if (needsConfirmation(kind)) setConfirming(method === undefined ? { kind } : { kind, method })
    else run(kind, method)
  }

  if (pr.state !== 'OPEN') {
    // Closed and unmerged can be reopened; merged is final everywhere.
    if (pr.state !== 'CLOSED') return null
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => actions.reopen(pr)}
        className="pr:rounded-md pr:border pr:border-neutral-300 pr:px-2 pr:py-0.5 pr:text-xs pr:text-neutral-600 pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:border-neutral-700 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800"
      >
        {busy ? t('action.working') : t('action.reopen')}
      </button>
    )
  }

  return (
    <div className="pr:relative" ref={box}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('action.menu')}
        className="pr:rounded-md pr:border pr:border-neutral-300 pr:px-2 pr:py-0.5 pr:text-xs pr:text-neutral-600 pr:hover:bg-neutral-100 pr:disabled:opacity-50 pr:dark:border-neutral-700 pr:dark:text-neutral-400 pr:dark:hover:bg-neutral-800"
      >
        {busy ? t('action.working') : '⋯'}
      </button>

      {open && confirming === null && (
        <div
          role="menu"
          className="pr:absolute pr:end-0 pr:z-20 pr:mt-1 pr:min-w-56 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-white pr:py-1 pr:shadow-lg pr:dark:border-neutral-800 pr:dark:bg-neutral-900"
        >
          {merge.can ? (
            methodsFor(info).map((method) => (
              <Button
                key={method}
                variant="menuitem"
                role="menuitem"
                onClick={() => start('merge', method)}
              >
                {t(METHOD_LABEL[method])}
              </Button>
            ))
          ) : (
            /* Why, not a greyed-out button with no explanation. Each reason
               sends a person somewhere different -- resolve a conflict, wait
               for a check, update a branch. */
            <p className="pr:px-3 pr:py-1.5 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
              {t(merge.why)}
            </p>
          )}

          {close.can && (
            <>
              <div className="pr:my-1 pr:h-px pr:bg-neutral-200 pr:dark:bg-neutral-800" />
              <span className="pr:block pr:[&>button]:text-red-600 pr:dark:[&>button]:text-red-400">
                <Button variant="menuitem" role="menuitem" onClick={() => start('close')}>
                  {t('action.close')}
                </Button>
              </span>
            </>
          )}
        </div>
      )}

      {confirming !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t(confirming.kind === 'merge' ? 'action.confirmMerge' : 'action.confirmClose', {
            pr: reference(pr),
          })}
          className="pr:absolute pr:end-0 pr:z-30 pr:mt-1 pr:w-72 pr:rounded-md pr:border pr:border-neutral-200 pr:bg-white pr:p-3 pr:shadow-lg pr:dark:border-neutral-800 pr:dark:bg-neutral-900"
        >
          {/* The repository and number are in the question on purpose. A
              confirmation that says "are you sure?" confirms nothing: it is
              agreed to without being read, and the row it refers to is the one
              thing worth checking. */}
          <p className="pr:text-sm pr:font-medium pr:text-neutral-900 pr:dark:text-neutral-100">
            {t(confirming.kind === 'merge' ? 'action.confirmMerge' : 'action.confirmClose', {
              pr: reference(pr),
            })}
          </p>
          <p className="pr:mt-1 pr:text-xs pr:text-neutral-500 pr:dark:text-neutral-400">
            {t(confirming.kind === 'merge' ? 'action.confirmMergeBody' : 'action.confirmCloseBody')}
          </p>
          <div className="pr:mt-3 pr:flex pr:gap-2">
            <Button
              variant={confirming.kind === 'merge' ? 'primary' : 'danger'}
              autoFocus
              onClick={() => run(confirming.kind, confirming.method)}
            >
              {t(confirming.kind === 'merge' ? 'action.merge' : 'action.close')}
            </Button>
            <Button variant="default" onClick={() => setConfirming(null)}>
              {t('action.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

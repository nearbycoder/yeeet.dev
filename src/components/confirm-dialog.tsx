import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, ReactNode } from 'react'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  busy?: boolean
  busyLabel?: string
  eyebrow?: string
  cancelLabel?: string
  tone?: 'danger' | 'neutral'
  onCancel: () => void
  onConfirm: () => void
}

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  busyLabel = 'Deleting…',
  eyebrow = 'DANGER ZONE',
  cancelLabel = 'Keep it',
  tone = 'danger',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    cancelButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus()
      }
    }
  }, [open])

  if (!open || typeof document === 'undefined') return null

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.getAttribute('aria-hidden') !== 'true')
    if (!focusable.length) {
      event.preventDefault()
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="confirm-dialog-layer"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={busy}
        onKeyDown={handleKeyDown}
      >
        <div
          className={`confirm-dialog-mark ${tone === 'neutral' ? 'is-neutral' : ''}`}
          aria-hidden="true"
        >
          {tone === 'neutral' ? '↗' : '!'}
        </div>
        <div className="confirm-dialog-copy">
          <span>{eyebrow}</span>
          <h2 id={titleId}>{title}</h2>
          <p id={descriptionId}>{description}</p>
        </div>
        <div className="confirm-dialog-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="button"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${tone === 'danger' ? 'confirm-dialog-danger' : 'button-ink'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

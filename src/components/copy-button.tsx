import { useEffect, useState } from 'react'

type CopyFeedback = {
  value: string
  status: 'copying' | 'copied' | 'failed'
}

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const [feedback, setFeedback] = useState<CopyFeedback | null>(null)
  const status = feedback?.value === value ? feedback.status : null

  useEffect(() => {
    if (!feedback || feedback.status === 'copying') return
    const timeout = window.setTimeout(
      () => setFeedback(null),
      feedback.status === 'failed' ? 8000 : 3000,
    )
    return () => window.clearTimeout(timeout)
  }, [feedback])

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-busy={status === 'copying'}
      disabled={status === 'copying'}
      title={
        status === 'failed'
          ? 'Try again, or select the text and copy it manually.'
          : label
      }
      onClick={async () => {
        setFeedback({ value, status: 'copying' })
        try {
          await navigator.clipboard.writeText(value)
          setFeedback({ value, status: 'copied' })
        } catch {
          setFeedback({ value, status: 'failed' })
        }
      }}
    >
      <span aria-live="polite" aria-atomic="true">
        {status === 'copying'
          ? 'Copying…'
          : status === 'copied'
            ? 'Copied!'
            : status === 'failed'
              ? 'Copy failed. Retry'
              : label}
      </span>
    </button>
  )
}

import { useState } from 'react'
import { downloadText } from '#/lib/download'

export function DownloadButton({
  name,
  content,
  type,
  children,
  disabled = false,
}: {
  name: string
  content: () => string
  type: string
  children: React.ReactNode
  disabled?: boolean
}) {
  const [error, setError] = useState('')
  return (
    <>
      <button
        type="button"
        className="button button-paper"
        disabled={disabled}
        onClick={() => {
          try {
            setError('')
            downloadText(name, content(), type)
          } catch {
            setError('Could not prepare the download. Try again.')
          }
        }}
      >
        {children}
      </button>
      {error ? (
        <span role="alert" className="form-error">
          {error}
        </span>
      ) : null}
    </>
  )
}

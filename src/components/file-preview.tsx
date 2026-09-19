import { useEffect, useState } from 'react'

export function FilePreview({
  slug,
  version,
  path,
  onClose,
}: {
  slug: string
  version: string
  path: string
  onClose: () => void
}) {
  const [result, setResult] = useState<{
    text: string
    truncated: boolean
  } | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/sites/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/file?${new URLSearchParams({ path })}`,
          { signal: controller.signal },
        )
        const data = await response.json()
        if (!response.ok)
          throw new Error(data.error?.message || 'Could not load the file.')
        setResult(data)
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not load the file.',
          )
      }
    })()
    return () => controller.abort()
  }, [slug, version, path])
  return (
    <section className="console-item" aria-label={`Text preview: ${path}`}>
      <h3>Text preview: {path}</h3>
      <button className="button button-paper" onClick={onClose}>
        Close preview
      </button>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : result ? (
        <>
          <p>
            {result.truncated
              ? 'Showing the first 64 KiB. The rest of the file is not displayed.'
              : 'UTF-8 source shown as plain text.'}
          </p>
          <pre className="console-code" tabIndex={0}>
            {result.text || '(Empty file)'}
          </pre>
        </>
      ) : (
        <p role="status">Loading file…</p>
      )}
    </section>
  )
}

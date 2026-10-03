import { useEffect, useMemo, useRef, useState } from 'react'
import { formatJsonSource, sourceMatches } from '#/lib/source-reader'
import { CopyButton } from './copy-button'

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
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState(0)
  const [wrap, setWrap] = useState(false)
  const [numbers, setNumbers] = useState(true)
  const [formatted, setFormatted] = useState<string | null>(null)
  const [formatError, setFormatError] = useState('')
  const activeMatch = useRef<HTMLElement>(null)
  const text = formatted ?? result?.text ?? ''
  const matches = useMemo(() => sourceMatches(text, query), [text, query])
  const current = matches.length ? position % matches.length : 0
  const lineCount = text.split('\n').length
  const showNumbers = numbers && !wrap && lineCount <= 2000
  const highlighted = useMemo(() => {
    const parts: Array<React.ReactNode> = []
    let from = 0
    matches.forEach((match, index) => {
      parts.push(text.slice(from, match.start))
      parts.push(
        <mark
          key={match.start}
          ref={index === current ? activeMatch : undefined}
          className={index === current ? 'is-current' : ''}
        >
          {text.slice(match.start, match.end)}
        </mark>,
      )
      from = match.end
    })
    parts.push(text.slice(from))
    return parts
  }, [text, matches, current])
  useEffect(() => {
    activeMatch.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [current, matches])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    setResult(null)
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
  }, [slug, version, path, retry])
  return (
    <section className="console-item" aria-label={`Text preview: ${path}`}>
      <h3>Text preview: {path}</h3>
      <button className="button button-paper" onClick={onClose}>
        Close preview
      </button>
      {error ? (
        <p role="alert" className="form-error">
          {error}{' '}
          <button
            className="button button-paper"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry preview
          </button>
        </p>
      ) : result ? (
        <>
          <p>
            {result.truncated
              ? 'Showing the first 64 KiB. The rest of the file is not displayed.'
              : 'UTF-8 source shown as plain text.'}
          </p>
          <div className="source-toolbar">
            <label className="console-field">
              Find in source
              <input
                type="search"
                value={query}
                maxLength={200}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPosition(0)
                }}
                placeholder="Literal text…"
              />
            </label>
            <div className="console-actions">
              <button
                className="button button-paper"
                disabled={!matches.length}
                onClick={() =>
                  setPosition((current + matches.length - 1) % matches.length)
                }
              >
                Previous match
              </button>
              <button
                className="button button-paper"
                disabled={!matches.length}
                onClick={() => setPosition((current + 1) % matches.length)}
              >
                Next match
              </button>
              <span role="status">
                {query
                  ? matches.length
                    ? `${current + 1} of ${matches.length}${matches.length === 1000 ? '+' : ''} matches · line ${matches[current].line}`
                    : 'No matches'
                  : `${lineCount} lines`}
              </span>
            </div>
            <div className="console-actions">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={wrap}
                  onChange={(event) => setWrap(event.target.checked)}
                />
                Wrap long lines
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={numbers}
                  onChange={(event) => setNumbers(event.target.checked)}
                  disabled={wrap || lineCount > 2000}
                />
                Line numbers
              </label>
              <button
                className="button button-paper"
                disabled={result.truncated}
                onClick={() => {
                  setFormatError('')
                  setPosition(0)
                  if (formatted !== null) {
                    setFormatted(null)
                    return
                  }
                  try {
                    setFormatted(
                      formatJsonSource(result.text, result.truncated),
                    )
                  } catch (failure) {
                    setFormatError(
                      failure instanceof Error
                        ? failure.message
                        : 'Could not format JSON.',
                    )
                  }
                }}
              >
                {formatted !== null ? 'Show original source' : 'Format JSON'}
              </button>
              <CopyButton
                value={text}
                label="Copy displayed source"
                className="button button-paper"
              />
            </div>
            {numbers && !showNumbers ? (
              <small>
                Line numbers are hidden when wrapping or when a file exceeds
                2,000 lines.
              </small>
            ) : null}
            {formatError ? (
              <p role="alert" className="form-error">
                {formatError}
              </p>
            ) : null}
          </div>
          <div
            className={`source-reader ${wrap ? 'is-wrapped' : ''}`}
            tabIndex={0}
            role="region"
            aria-label={`Source for ${path}`}
          >
            {showNumbers ? (
              <pre className="source-line-numbers" aria-hidden="true">
                {Array.from(
                  { length: lineCount },
                  (_, index) => index + 1,
                ).join('\n')}
              </pre>
            ) : null}
            <pre className="source-text">
              <code>{text ? highlighted : '(Empty file)'}</code>
            </pre>
          </div>
        </>
      ) : (
        <p role="status">Loading file…</p>
      )}
    </section>
  )
}

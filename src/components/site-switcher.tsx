import { useEffect, useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { getSiteSearchPage } from '#/server/functions'

export function SiteSwitcher() {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [retry, setRetry] = useState(0)
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof getSiteSearchPage>
  > | null>(null)
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const title = useId()
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])
  useEffect(() => {
    if (open) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : trigger.current
      dialog.current?.showModal()
      input.current?.focus()
    } else if (dialog.current?.open) {
      dialog.current.close()
      previousFocus.current?.focus()
    }
  }, [open])
  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setError('')
    const timer = setTimeout(() => {
      void getSiteSearchPage({ data: { q: query.slice(0, 200) } })
        .then((page) => {
          if (active) {
            setResult(page)
            setLoading(false)
          }
        })
        .catch(() => {
          if (active) {
            setError('Could not search sites. Try again.')
            setLoading(false)
          }
        })
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, open, retry])
  return (
    <>
      <button
        className="button button-paper"
        onClick={() => setOpen(true)}
        ref={trigger}
        aria-keyshortcuts="Control+k Meta+k"
      >
        Switch site
      </button>
      <dialog
        className="panel site-page-panel site-switcher-dialog"
        ref={dialog}
        aria-labelledby={title}
        onClose={() => setOpen(false)}
        onCancel={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="console-actions">
          <h2 id={title}>Switch site</h2>
          <button
            className="button button-paper"
            onClick={() => setOpen(false)}
          >
            Close site switcher
          </button>
        </div>
        <label className="console-field">
          Search your sites
          <input
            ref={input}
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Site, domain, project, or tag…"
          />
        </label>
        <p>
          Ctrl/⌘ K opens this switcher. Tab through results; Escape closes it.
        </p>
        {loading ? (
          <p role="status">Searching sites…</p>
        ) : error ? (
          <p role="alert">
            {error}{' '}
            <button onClick={() => setRetry((value) => value + 1)}>
              Retry site search
            </button>
          </p>
        ) : (
          <>
            <p role="status">
              {result?.matchedCount ?? 0} matching sites.{' '}
              {result?.nextCursor
                ? 'Showing the first 20; narrow your search.'
                : ''}
            </p>
            <ul>
              {result?.sites.map((site) => (
                <li key={site.id}>
                  <Link
                    to="/dashboard/sites/$slug"
                    params={{ slug: site.slug }}
                    onClick={() => setOpen(false)}
                  >
                    {site.slug}
                  </Link>
                </li>
              ))}
            </ul>
            {!result?.sites.length ? (
              <p>No sites found. Try a different search.</p>
            ) : null}
          </>
        )}
      </dialog>
    </>
  )
}

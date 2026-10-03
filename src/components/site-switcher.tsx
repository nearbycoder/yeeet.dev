import { useEffect, useId, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { getSiteSearchPage } from '#/server/functions'

const destinations = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    detail: 'Deploy a build or browse your fleet',
  },
  {
    to: '/dashboard/workspaces',
    label: 'Workspaces',
    detail: 'Team sites and version feedback',
  },
  {
    to: '/dashboard/storage',
    label: 'Storage',
    detail: 'Review retained deployment bytes',
  },
  {
    to: '/dashboard/settings',
    label: 'Integrations',
    detail: 'API keys, webhooks, sessions, preferences',
  },
] as const

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
  const commands = destinations.filter((command) =>
    `${command.label} ${command.detail}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  function moveResult(event: React.KeyboardEvent<HTMLDialogElement>) {
    const targets = Array.from(
      dialog.current?.querySelectorAll<HTMLAnchorElement>(
        '[data-command-result]',
      ) ?? [],
    )
    if (!targets.length) return
    const index = targets.indexOf(document.activeElement as HTMLAnchorElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next =
        event.key === 'ArrowDown'
          ? (index + 1) % targets.length
          : index < 0
            ? targets.length - 1
            : (index + targets.length - 1) % targets.length
      targets[next].focus()
    } else if (event.key === 'Enter' && event.target === input.current) {
      event.preventDefault()
      targets[0].click()
    }
  }
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
        Switch site <kbd>⌘/Ctrl K</kbd>
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
          moveResult(event)
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <div className="console-actions">
          <h2 id={title}>Go to…</h2>
          <button
            className="button button-paper"
            onClick={() => setOpen(false)}
          >
            Close site switcher
          </button>
        </div>
        <label className="console-field">
          Search sites and commands
          <input
            ref={input}
            type="search"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Site, domain, project, tag, or command…"
          />
        </label>
        <p>↑ ↓ to choose · Enter to open · Escape to close</p>
        {commands.length ? (
          <section aria-label="Quick commands">
            <h3>Quick commands</h3>
            <ul className="command-results">
              {commands.map((command) => (
                <li key={command.to}>
                  <Link
                    data-command-result
                    to={command.to}
                    search={
                      command.to === '/dashboard/storage'
                        ? { sort: 'bytes', page: 0 }
                        : {}
                    }
                    onClick={() => setOpen(false)}
                  >
                    <span>
                      <strong>{command.label}</strong>
                      <small>{command.detail}</small>
                    </span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
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
            <ul className="command-results">
              {result?.sites.map((site) => (
                <li key={site.id}>
                  <Link
                    to="/dashboard/sites/$slug"
                    params={{ slug: site.slug }}
                    onClick={() => setOpen(false)}
                    data-command-result
                  >
                    <span>
                      <strong>{site.slug}</strong>
                      <small>
                        {site.organization.project ||
                          new URL(site.url).hostname}
                      </small>
                    </span>
                    <span aria-hidden="true">↗</span>
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

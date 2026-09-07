import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  recentSitesKey,
  recentSitesSchema,
  rememberSite,
} from '#/lib/recent-sites'

export function RecordRecentSite({
  userId,
  slug,
}: {
  userId: string
  slug: string
}) {
  useEffect(() => {
    try {
      const key = recentSitesKey(userId)
      const items = rememberSite(
        JSON.parse(localStorage.getItem(key) ?? '[]'),
        slug,
      )
      localStorage.setItem(key, JSON.stringify(items))
    } catch {
      /* Site access must work when browser history storage is unavailable. */
    }
  }, [userId, slug])
  return null
}
export function RecentSites({ userId }: { userId: string }) {
  const [items, setItems] = useState<
      ReturnType<typeof recentSitesSchema.parse>
    >([]),
    [error, setError] = useState('')
  const key = recentSitesKey(userId)
  useEffect(() => {
    function read() {
      try {
        setItems(
          recentSitesSchema.parse(
            JSON.parse(localStorage.getItem(key) ?? '[]'),
          ),
        )
        setError('')
      } catch {
        setItems([])
        setError('Recent sites are unavailable in this browser.')
      }
    }
    read()
    function changed(event: StorageEvent) {
      if (event.key === key) read()
    }
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [key])
  function remove(slug?: string) {
    try {
      const next = slug ? items.filter((item) => item.slug !== slug) : []
      localStorage.setItem(key, JSON.stringify(next))
      setItems(next)
      setError('')
    } catch {
      setError('Could not clear browser history. Try again.')
    }
  }
  return (
    <details className="console-item">
      <summary>Recently visited sites ({items.length})</summary>
      <p>
        Up to eight site workspaces visited by this account in this browser.
        Deleted sites can be removed from this list.
      </p>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <ul>
        {items.map((item) => (
          <li key={item.slug}>
            <Link to="/dashboard/sites/$slug" params={{ slug: item.slug }}>
              {item.slug}
            </Link>{' '}
            · {new Date(item.visitedAt).toLocaleDateString()}{' '}
            <button
              className="button button-paper"
              aria-label={`Remove ${item.slug} from recent sites`}
              onClick={() => remove(item.slug)}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {items.length || error ? (
        <button className="button button-paper" onClick={() => remove()}>
          Clear recent sites
        </button>
      ) : (
        <p>Open a site workspace to add it here.</p>
      )}
    </details>
  )
}

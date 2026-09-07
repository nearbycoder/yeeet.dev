import { useEffect, useState } from 'react'
import { savedViewsSchema, saveView } from '#/lib/saved-views'
import type { SavedView } from '#/lib/saved-views'

export function SavedViews({
  userId,
  filters,
  onLoad,
}: {
  userId: string
  filters: unknown
  onLoad: (filters: SavedView['filters']) => void
}) {
  const [views, setViews] = useState<Array<SavedView>>([]),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const key = `yeeet:saved-views:v1:${userId}`
  useEffect(() => {
    try {
      setViews(
        savedViewsSchema.parse(JSON.parse(localStorage.getItem(key) ?? '[]')),
      )
    } catch {
      setViews([])
      setError(
        'Saved views could not be loaded. A new save replaces the unreadable browser record.',
      )
    }
  }, [key])
  function persist(next: Array<SavedView>) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setViews(next)
      setError('')
      return true
    } catch {
      setError(
        'Browser storage is unavailable. Your saved views were not changed.',
      )
      return false
    }
  }
  return (
    <details className="console-item">
      <summary>Saved fleet views ({views.length}/12)</summary>
      <p>
        Saved in this browser for your account. Saving an existing name updates
        its filters.
      </p>
      <form
        className="console-form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          setNotice('')
          try {
            const next = saveView(views, name, filters)
            if (persist(next)) {
              setName('')
              setNotice('View saved.')
            }
          } catch {
            setError(
              'Use a name up to 60 characters. Delete a view before adding more than 12.',
            )
          }
        }}
      >
        <label>
          View name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
          />
        </label>
        <button className="button button-paper">Save current filters</button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      <ul>
        {views.map((view) => (
          <li key={view.id}>
            <button
              className="button button-paper"
              onClick={() => onLoad(view.filters)}
            >
              Load {view.name}
            </button>{' '}
            <button
              className="button danger-link"
              aria-label={`Delete saved view ${view.name}`}
              onClick={() => {
                if (persist(views.filter((item) => item.id !== view.id)))
                  setNotice('View deleted.')
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {!views.length ? (
        <p>Set your fleet filters, then save a named view.</p>
      ) : null}
    </details>
  )
}

import { useEffect, useState } from 'react'
import { getBrowserSessions, endBrowserSession } from '#/server/functions'
import { ConfirmDialog } from './confirm-dialog'

export function SessionManager() {
  const [data, setData] = useState<Awaited<
      ReturnType<typeof getBrowserSessions>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [confirm, setConfirm] = useState(false)
  useEffect(() => {
    let active = true
    getBrowserSessions()
      .then((value) => {
        if (active) setData(value)
      })
      .catch(() => {
        if (active)
          setError(
            'Could not load sessions. Retry, or sign in again if your session needs renewal.',
          )
      })
    return () => {
      active = false
    }
  }, [])
  async function refresh() {
    setBusy(true)
    setError('')
    try {
      setData(await getBrowserSessions())
    } catch {
      setError(
        'Could not load sessions. Retry, or sign in again if your session needs renewal.',
      )
    } finally {
      setBusy(false)
    }
  }
  async function revoke(
    action: { action: 'one'; id: string } | { action: 'others' },
  ) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await endBrowserSession({ data: action })
      setConfirm(false)
      setData(await getBrowserSessions())
      setNotice('Selected sessions signed out.')
    } catch {
      setError(
        'Could not end the session. Refresh and retry, or sign in again to authorize this change.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="panel site-page-panel" id="sessions">
      <h2>Browser sessions</h2>
      <p>
        Review active sign-ins and end access on another browser. This browser
        stays signed in. Browser and IP information may be unavailable or
        approximate.
      </p>
      <div className="console-actions">
        <button
          type="button"
          className="button button-paper"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh sessions
        </button>
        <button
          type="button"
          className="button button-paper"
          disabled={busy || !data || data.total < 2}
          onClick={() => setConfirm(true)}
        >
          Sign out all other sessions
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!data && !error ? <p role="status">Loading sessions…</p> : null}
      {data ? (
        <>
          <p>
            Showing {data.sessions.length} of {data.total} active sessions.
          </p>
          <div className="site-page-stack">
            {data.sessions.map((row) => (
              <article className="console-item" key={row.id}>
                <h3>{row.current ? 'This browser' : 'Other session'}</h3>
                <p style={{ overflowWrap: 'anywhere' }}>{row.userAgent}</p>
                <p>
                  IP: {row.ipAddress} · Started{' '}
                  {new Date(row.createdAt).toLocaleString()} · Expires{' '}
                  {new Date(row.expiresAt).toLocaleString()}
                </p>
                {!row.current ? (
                  <button
                    type="button"
                    className="button button-paper"
                    disabled={busy}
                    onClick={() => void revoke({ action: 'one', id: row.id })}
                  >
                    Sign out this session
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={confirm}
        title="Sign out other sessions?"
        description="Other browsers will need to sign in again. API keys are managed separately below."
        confirmLabel="Sign out others"
        busyLabel="Signing out…"
        cancelLabel="Cancel"
        eyebrow="ACCOUNT ACCESS"
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void revoke({ action: 'others' })}
      />
    </section>
  )
}

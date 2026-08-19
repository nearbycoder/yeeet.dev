import { Fragment, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { getSiteVersionsData } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug/versions')({
  loader: ({ params }) => getSiteVersionsData({ data: { slug: params.slug } }),
  component: SiteVersions,
})

type VersionAction = {
  kind: 'activate' | 'delete' | 'public' | 'rotate'
  id: string
  title: string
  description: string
  confirmLabel: string
}

function formatBytes(value: number | null) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const rank = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function SiteVersions() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [accessVersion, setAccessVersion] = useState('')
  const [password, setPassword] = useState('')
  const [action, setAction] = useState<VersionAction | null>(null)
  const currentIndex = data.versions.findIndex((version) => version.current)
  const previous =
    currentIndex >= 0
      ? data.versions
          .slice(currentIndex + 1)
          .find((version) => version.status === 'ready')
      : undefined

  async function request(
    key: string,
    path: string,
    init: RequestInit,
    fallback: string,
  ) {
    setBusy(key)
    setError('')
    try {
      const response = await fetch(path, init)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error?.message || fallback)
      await router.invalidate()
      return body
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : fallback)
      throw requestError
    } finally {
      setBusy('')
    }
  }

  async function updateAccess(
    deploymentId: string,
    input: { password?: string | null; rotateShareLink?: boolean },
  ) {
    await request(
      `access-${deploymentId}`,
      `/api/v1/sites/${encodeURIComponent(data.site.slug)}/versions/${deploymentId}/access`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      },
      'Could not update version access.',
    )
  }

  async function runConfirmedAction() {
    if (!action) return
    const base = `/api/v1/sites/${encodeURIComponent(data.site.slug)}/versions/${action.id}`
    try {
      if (action.kind === 'activate') {
        await request(
          `activate-${action.id}`,
          `${base}/activate`,
          { method: 'POST' },
          'Could not activate this version.',
        )
      } else if (action.kind === 'delete') {
        await request(
          `delete-${action.id}`,
          base,
          { method: 'DELETE' },
          'Could not delete this version.',
        )
      } else if (action.kind === 'public') {
        await updateAccess(action.id, { password: null })
      } else {
        await updateAccess(action.id, { rotateShareLink: true })
      }
      setAction(null)
      setAccessVersion('')
    } catch {
      // The request helper exposes the error next to the version list.
    }
  }

  return (
    <section className="panel site-page-panel">
      <div className="panel-heading site-page-heading">
        <div>
          <span>IMMUTABLE HISTORY</span>
          <h2>Versions</h2>
          <p>
            Preview, protect, promote, or remove any launch without touching the
            others.
          </p>
        </div>
        {previous ? (
          <button
            type="button"
            className="button button-ink"
            disabled={Boolean(busy)}
            onClick={() =>
              setAction({
                kind: 'activate',
                id: previous.id,
                title: `Roll back to ${previous.id.slice(0, 8)}?`,
                description:
                  'This ready version will become live. The current version will remain available in history.',
                confirmLabel: 'Roll back',
              })
            }
          >
            Roll back to previous
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="form-error site-page-error" role="alert">
          {error}
        </p>
      ) : null}

      {data.versions.length ? (
        <div className="site-version-list">
          {data.versions.map((version, index) => (
            <Fragment key={version.id}>
              <article
                className={`site-version-card ${version.current ? 'is-current' : ''}`}
              >
                <div className="site-version-index">
                  <span>v{data.versions.length - index}</span>
                  <i className={`activity-status ${version.status}`}>
                    {version.status === 'ready'
                      ? '✓'
                      : version.status === 'failed'
                        ? '!'
                        : '↑'}
                  </i>
                </div>
                <div className="site-version-details">
                  <div>
                    <h3>{version.id.slice(0, 8)}</h3>
                    <span
                      className={`state-pill ${version.current ? 'live' : version.status === 'failed' ? 'blocked' : ''}`}
                    >
                      {version.current ? 'Live' : version.status}
                    </span>
                  </div>
                  <p>
                    {version.source} · {formatDate(version.createdAt)}
                    {version.channel ? ` · ${version.channel} channel` : ''}
                  </p>
                  <small>
                    {version.fileCount} files ·{' '}
                    {formatBytes(version.totalBytes)}
                    {' · '}
                    {version.spaFallback
                      ? 'SPA routing'
                      : 'Static routing'} ·{' '}
                    {version.protected ? 'Private' : 'Public'}
                  </small>
                </div>
                <div className="site-version-actions">
                  {version.previewUrl ? (
                    <a
                      className="button button-paper"
                      href={version.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview ↗
                    </a>
                  ) : null}
                  {version.shareUrl ? (
                    <button
                      type="button"
                      className="button button-paper"
                      onClick={() =>
                        navigator.clipboard.writeText(version.shareUrl!)
                      }
                    >
                      Copy share link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-paper"
                    onClick={() => {
                      setAccessVersion(
                        accessVersion === version.id ? '' : version.id,
                      )
                      setPassword('')
                    }}
                    aria-expanded={accessVersion === version.id}
                  >
                    {version.protected ? 'Manage access' : 'Protect'}
                  </button>
                  {!version.current && version.status === 'ready' ? (
                    <button
                      type="button"
                      className="button button-paper"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        setAction({
                          kind: 'activate',
                          id: version.id,
                          title: `Make ${version.id.slice(0, 8)} live?`,
                          description:
                            'Traffic will move to this version. The current live version stays available for rollback.',
                          confirmLabel: 'Make live',
                        })
                      }
                    >
                      Make live
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="button button-paper danger-link"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      setAction({
                        kind: 'delete',
                        id: version.id,
                        title: `Delete ${version.id.slice(0, 8)}?`,
                        description: version.current
                          ? 'This is live now. The newest remaining ready version will become live automatically.'
                          : 'This immutable version and all of its stored files will be permanently removed.',
                        confirmLabel: version.current
                          ? 'Delete live version'
                          : 'Delete version',
                      })
                    }
                  >
                    Delete
                  </button>
                </div>
              </article>

              {accessVersion === version.id ? (
                <form
                  className="site-version-access"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (password.length < 8) return
                    void updateAccess(version.id, { password }).then(() => {
                      setPassword('')
                      setAccessVersion('')
                    })
                  }}
                >
                  <div>
                    <b>
                      {version.protected
                        ? 'Change the password'
                        : 'Password protect this version'}
                    </b>
                    <small>
                      Share links bypass the password without requiring an
                      account.
                    </small>
                  </div>
                  <label>
                    <span className="sr-only">Deployment password</span>
                    <input
                      name={`version-password-${version.id}`}
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters…"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="submit"
                    className="button button-coral"
                    disabled={password.length < 8 || Boolean(busy)}
                  >
                    {busy === `access-${version.id}`
                      ? 'Saving…'
                      : 'Save password'}
                  </button>
                  {version.protected ? (
                    <div className="site-version-access-secondary">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setAction({
                            kind: 'public',
                            id: version.id,
                            title: 'Make this version public?',
                            description:
                              'Anyone with its preview URL will be able to view it without a password.',
                            confirmLabel: 'Make public',
                          })
                        }
                      >
                        Make public
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          setAction({
                            kind: 'rotate',
                            id: version.id,
                            title: 'Rotate the share link?',
                            description:
                              'The existing one-click link will stop working and a new one will be generated.',
                            confirmLabel: 'Rotate link',
                          })
                        }
                      >
                        Rotate share link
                      </button>
                    </div>
                  ) : null}
                </form>
              ) : null}
            </Fragment>
          ))}
        </div>
      ) : (
        <div className="empty-state">Deploy again to create a new version.</div>
      )}

      <p className="site-page-note">
        Live aliases revalidate at the edge within about 10 seconds. Immutable
        preview URLs never change and stay no-index.
      </p>
      <ConfirmDialog
        open={Boolean(action)}
        title={action?.title ?? ''}
        description={action?.description ?? ''}
        confirmLabel={action?.confirmLabel ?? 'Confirm'}
        busy={Boolean(busy)}
        busyLabel="Working…"
        eyebrow={action?.kind === 'delete' ? 'DANGER ZONE' : 'CONFIRM CHANGE'}
        cancelLabel="Cancel"
        tone={action?.kind === 'delete' ? 'danger' : 'neutral'}
        onCancel={() => setAction(null)}
        onConfirm={() => void runConfirmedAction()}
      />
    </section>
  )
}

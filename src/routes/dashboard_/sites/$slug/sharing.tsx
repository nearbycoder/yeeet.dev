import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getSiteVersionsData } from '#/server/functions'
import { CopyButton } from '#/components/copy-button'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { requestJson, useConsoleMutation } from '#/lib/console-request'

export const Route = createFileRoute('/dashboard_/sites/$slug/sharing')({
  validateSearch: z.object({ version: z.string().optional() }),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    getSiteVersionsData({ data: { slug: params.slug, version: deps.version } }),
  component: Sharing,
})
function Sharing() {
  const history = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const ready = history.versions.filter((entry) => entry.status === 'ready')
  const version =
    ready.find((entry) => entry.id === search.version) ??
    ready.find((entry) => entry.current) ??
    ready.at(0)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState<'public' | 'rotate' | null>(null)
  const mutation = useConsoleMutation()
  const endpoint = `/api/v1/sites/${encodeURIComponent(history.site.slug)}/versions/${version?.id}/access`
  return (
    <section className="panel site-page-panel">
      <div className="panel-heading site-page-heading">
        <div>
          <h2>Sharing center</h2>
          <p>
            Choose whether to share the moving live site or one exact
            deployment.
          </p>
        </div>
      </div>
      {mutation.error ? (
        <p className="form-error" role="alert">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? (
        <p className="form-success" role="status">
          {mutation.notice}
        </p>
      ) : null}
      <article className="console-item">
        <h3>Live site</h3>
        <p>
          This URL follows production updates. Access depends on the version
          currently live.
        </p>
        <a href={history.site.url} target="_blank" rel="noreferrer">
          {history.site.url} ↗
        </a>
        <div className="console-actions">
          <CopyButton
            value={history.site.url}
            label="Copy live URL"
            className="button button-paper"
          />
        </div>
      </article>
      <label className="console-form-grid">
        Immutable version
        <select
          value={version?.id ?? ''}
          onChange={(event) => {
            setConfirm(null)
            setPassword('')
            void navigate({ search: { version: event.target.value } })
          }}
        >
          {ready.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id.slice(0, 8)} · {entry.protected ? 'Private' : 'Public'}
              {entry.current ? ' · Live' : ''}
            </option>
          ))}
        </select>
      </label>
      {version ? (
        <article className="console-item">
          <h3>
            {version.protected ? 'Private deployment' : 'Public deployment'}
          </h3>
          <p>
            This preview always points to version{' '}
            <code>{version.id.slice(0, 8)}</code>.
          </p>
          <a href={version.previewUrl!} target="_blank" rel="noreferrer">
            {version.previewUrl}
          </a>
          <div className="console-actions">
            <CopyButton
              value={version.previewUrl!}
              label="Copy version URL"
              className="button button-paper"
            />
            {version.shareUrl ? (
              <CopyButton
                value={version.shareUrl}
                label="Copy private share link"
                className="button button-ink"
              />
            ) : null}
          </div>
          {version.protected ? (
            <p>
              A private share link bypasses the password. Anyone holding it can
              view this version until you rotate the link.
            </p>
          ) : (
            <p>Anyone with the preview URL can view this version.</p>
          )}
          <form
            className="console-form-grid"
            onSubmit={(event) => {
              event.preventDefault()
              void mutation.run(async () => {
                await requestJson(endpoint, 'PATCH', { password })
                setPassword('')
              }, 'Password protection updated.')
            }}
          >
            <label>
              {version.protected ? 'Replace password' : 'Set a password'}
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="button button-ink" disabled={mutation.busy}>
              Save protection
            </button>
          </form>
          {version.protected ? (
            <div className="console-actions">
              <button
                type="button"
                className="button button-paper"
                disabled={mutation.busy}
                onClick={() => setConfirm('rotate')}
              >
                Rotate private link
              </button>
              <button
                type="button"
                className="button danger-link"
                disabled={mutation.busy}
                onClick={() => setConfirm('public')}
              >
                Make public
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <p className="empty-state">No ready versions to share yet.</p>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm === 'public'
            ? 'Make this version public?'
            : 'Rotate the private share link?'
        }
        description={
          confirm === 'public'
            ? 'Anyone will be able to view this deployment without a password, including through production if it is live.'
            : 'The old link will stop working. Share the replacement only with the people who need access.'
        }
        confirmLabel={confirm === 'public' ? 'Make public' : 'Rotate link'}
        cancelLabel="Cancel"
        busy={mutation.busy}
        busyLabel="Saving…"
        tone="neutral"
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void mutation.run(async () => {
            await requestJson(
              endpoint,
              'PATCH',
              confirm === 'public'
                ? { password: null }
                : { rotateShareLink: true },
            )
            setConfirm(null)
          })
        }
      />
    </section>
  )
}

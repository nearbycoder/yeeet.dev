import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { useConsoleMutation } from '#/lib/console-request'
import {
  getLifecycleConsole,
  updatePreviewExpiry,
  updateHealthCheck,
  checkSiteHealth,
} from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug/lifecycle')({
  loader: ({ params }) => getLifecycleConsole({ data: { slug: params.slug } }),
  component: Lifecycle,
})
function Lifecycle() {
  const { history, health } = Route.useLoaderData()
  const { slug } = Route.useParams()
  const mutation = useConsoleMutation()
  const [confirm, setConfirm] = useState<{
    version: string
    hours: number
  } | null>(null)
  return (
    <div className="site-page-stack">
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
      <section className="panel site-page-panel">
        <h2>Preview expiry</h2>
        <p>
          Expire a review version and every channel pointing to it. Expired
          previews return HTTP 410, including private share links. Production
          never expires. Expiry does not delete files. Previously cached or
          downloaded copies cannot be recalled.
        </p>
        {history.versions
          .filter((version) => version.status === 'ready' && !version.current)
          .map((version) => (
            <article className="console-item" key={version.id}>
              <b>{version.id.slice(0, 8)}</b>
              <p>
                {version.expiresAt
                  ? `Expires ${new Date(version.expiresAt).toLocaleString()}`
                  : 'No expiry'}
              </p>
              <form
                className="console-form-grid"
                onSubmit={(event) => {
                  event.preventDefault()
                  setConfirm({
                    version: version.id,
                    hours: Number(
                      new FormData(event.currentTarget).get('hours'),
                    ),
                  })
                }}
              >
                <label>
                  Expiry for {version.id.slice(0, 8)}
                  <select name="hours" defaultValue="24">
                    <option value="1">1 hour from now</option>
                    <option value="24">24 hours from now</option>
                    <option value="168">7 days from now</option>
                    <option value="720">30 days from now</option>
                    <option value="0">Never / restore access</option>
                  </select>
                </label>
                <button
                  className="button button-paper"
                  disabled={mutation.busy}
                >
                  Set preview expiry
                </button>
              </form>
            </article>
          ))}
        {!history.versions.some(
          (version) => version.status === 'ready' && !version.current,
        ) ? (
          <p>No ready preview versions yet.</p>
        ) : null}
      </section>
      <section className="panel site-page-panel">
        <h2>Deployment health</h2>
        <p>
          Check a path on the production build at the origin, including private
          builds. Scheduled checks run about every 15 minutes while the app is
          running. These checks cover the serving path and storage; they do not
          test public DNS or the CDN.
        </p>
        <form
          className="console-form-grid"
          key={
            health
              ? `${slug}-${health.path}-${health.expectedStatus}-${health.enabled}`
              : slug
          }
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void mutation.run(() =>
              updateHealthCheck({
                data: {
                  slug,
                  path: String(form.get('path')),
                  expectedStatus: Number(form.get('status')),
                  enabled: form.get('enabled') === 'on',
                },
              }),
            )
          }}
        >
          <label>
            Health check path
            <input
              name="path"
              defaultValue={health?.path ?? '/'}
              required
              maxLength={500}
            />
          </label>
          <label>
            Expected HTTP status
            <input
              name="status"
              type="number"
              min={200}
              max={599}
              required
              defaultValue={health?.expectedStatus ?? 200}
            />
          </label>
          <label className="checkbox-label">
            <input
              name="enabled"
              type="checkbox"
              defaultChecked={health?.enabled ?? false}
            />
            Check every 15 minutes
          </label>
          <button className="button button-ink" disabled={mutation.busy}>
            Save health check
          </button>
        </form>
        <button
          className="button button-paper"
          disabled={mutation.busy || !health}
          onClick={() =>
            void mutation.run(
              () => checkSiteHealth({ data: { slug } }),
              'Health check complete.',
            )
          }
        >
          Check now
        </button>
        {health?.checkedAt ? (
          <div className="console-item">
            <h3>{health.error ? 'Needs attention' : 'Healthy'}</h3>
            <p>
              HTTP {health.responseStatus} · {health.latencyMs} ms · version{' '}
              {health.deploymentId?.slice(0, 8) ?? 'none'}
            </p>
            <p>Checked {new Date(health.checkedAt).toLocaleString()}</p>
            {health.error ? <p className="form-error">{health.error}</p> : null}
          </div>
        ) : (
          <p>No check results yet.</p>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.hours === 0
            ? 'Restore unlimited preview access?'
            : 'Set preview expiry?'
        }
        description={
          confirm?.hours === 0
            ? 'Anyone with a valid preview URL or private share link can access this version again.'
            : 'This version’s preview and channel URLs will stop serving at the selected time. Production will remain available.'
        }
        confirmLabel="Save expiry"
        busyLabel="Saving…"
        cancelLabel="Cancel"
        busy={mutation.busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void mutation.run(async () => {
            if (confirm)
              await updatePreviewExpiry({ data: { slug, ...confirm } })
            setConfirm(null)
          })
        }
      />
    </div>
  )
}

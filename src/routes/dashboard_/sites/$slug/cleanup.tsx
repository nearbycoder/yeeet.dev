import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { useConsoleMutation } from '#/lib/console-request'
import {
  getRetentionConsole,
  getRetentionPreview,
  updateRetention,
  cleanRetainedVersions,
} from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug/cleanup')({
  loader: ({ params }) => getRetentionConsole({ data: { slug: params.slug } }),
  component: Cleanup,
})
function Cleanup() {
  const { policy, pending } = Route.useLoaderData()
  const { slug } = Route.useParams()
  const [keepCount, setKeepCount] = useState(policy?.keepCount ?? 10)
  const [minAgeDays, setMinAgeDays] = useState(policy?.minAgeDays ?? 30)
  const [enabled, setEnabled] = useState(policy?.enabled ?? false)
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof getRetentionPreview>
  > | null>(null)
  const [confirm, setConfirm] = useState<'clean' | 'save' | null>(null)
  const mutation = useConsoleMutation()
  return (
    <div className="site-page-stack">
      <section className="panel site-page-panel">
        <h2>Version cleanup</h2>
        <p>
          Keep recent versions and remove older builds you no longer need.
          Production, every channel target, uploads in progress, and versions
          with unresolved feedback or a retention pin are always protected.
          Deleting a version removes its links and feedback permanently.
        </p>
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
        <form
          className="console-form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            void mutation.run(async () => {
              setPreview(
                await getRetentionPreview({
                  data: { slug, keepCount, minAgeDays },
                }),
              )
            }, 'Cleanup preview ready.')
          }}
        >
          <label>
            Keep latest completed versions
            <input
              type="number"
              required
              min={1}
              max={1000}
              value={keepCount}
              onChange={(event) => {
                setKeepCount(Number(event.target.value))
                setPreview(null)
              }}
            />
          </label>
          <label>
            Minimum age in days
            <input
              type="number"
              required
              min={1}
              max={3650}
              value={minAgeDays}
              onChange={(event) => {
                setMinAgeDays(Number(event.target.value))
                setPreview(null)
              }}
            />
          </label>
          <button className="button button-ink" disabled={mutation.busy}>
            Preview cleanup
          </button>
        </form>
        {preview ? (
          <div className="console-item">
            <h3>
              {preview.candidates.length}{' '}
              {preview.candidates.length === 1 ? 'version' : 'versions'}{' '}
              eligible · {(preview.totalBytes / 1024 / 1024).toFixed(2)} MB
            </h3>
            <p>
              Examined {preview.examined} recent versions;{' '}
              {preview.protectedCount} live, channel, or feedback references
              protected. Up to 50 versions are removed per run, from the latest
              2,000 examined.
            </p>
            {preview.candidates.length ? (
              <>
                <div className="console-table-wrap">
                  <table className="console-table">
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Created</th>
                        <th>Status</th>
                        <th>Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.candidates.map((version) => (
                        <tr key={version.id}>
                          <td>
                            <code>{version.id.slice(0, 8)}</code>
                          </td>
                          <td>
                            {new Date(version.createdAt).toLocaleString()}
                          </td>
                          <td>{version.status}</td>
                          <td>{(version.totalBytes / 1024).toFixed(1)} KB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="button danger-link"
                  disabled={mutation.busy}
                  onClick={() => setConfirm('clean')}
                >
                  Delete these versions
                </button>
              </>
            ) : (
              <p>Nothing to delete with these settings.</p>
            )}
          </div>
        ) : null}
      </section>
      <section className="panel site-page-panel">
        <h2>Automatic retention</h2>
        <p>
          Use the settings above for a daily cleanup while the app is running.
          Saving schedules the first run for tomorrow. Automatic retention is
          off until you enable it.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          Enable daily cleanup
        </label>
        <button
          className="button button-paper"
          disabled={mutation.busy}
          onClick={() => setConfirm('save')}
        >
          Save retention policy
        </button>
        {policy ? (
          <div className="console-item">
            <b>{policy.enabled ? 'Enabled' : 'Disabled'}</b>
            <p>
              Saved policy: keep {policy.keepCount} versions, at least{' '}
              {policy.minAgeDays} days old.
            </p>
            {policy.enabled ? (
              <p>
                Next run after {new Date(policy.nextRunAt).toLocaleString()}
              </p>
            ) : null}
            {policy.lastRunAt ? (
              <p>
                Last run: {new Date(policy.lastRunAt).toLocaleString()} ·{' '}
                {policy.lastDeletedCount} versions removed
              </p>
            ) : null}
            {policy.error ? <p className="form-error">{policy.error}</p> : null}
          </div>
        ) : null}
      </section>
      <section className="panel site-page-panel">
        <h2>Storage cleanup</h2>
        <p>
          Version records are removed first; stored files are then deleted by a
          retryable background job. Refresh this page to see progress.
        </p>
        {pending.length ? (
          pending.map((job) => (
            <article className="console-item" key={job.id}>
              <b>
                {job.id.slice(0, 8)} ·{' '}
                {job.attempts ? 'Retrying / processing' : 'Queued'}
              </b>
              <p>{job.attempts} attempts</p>
              {job.error ? <p className="form-error">{job.error}</p> : null}
            </article>
          ))
        ) : (
          <p>No pending storage cleanup.</p>
        )}
      </section>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm === 'clean'
            ? 'Permanently delete these versions?'
            : 'Save retention policy?'
        }
        description={
          confirm === 'clean'
            ? `The ${preview?.candidates.length ?? 0} listed versions and their feedback will be removed. The plan is checked again before deletion; changes require a fresh preview.`
            : `${enabled ? 'Enable daily deletion' : 'Disable daily deletion'} with at least ${keepCount} completed versions retained and a minimum age of ${minAgeDays} days. Production, channels, and unresolved feedback remain protected.`
        }
        confirmLabel={
          confirm === 'clean' ? 'Delete listed versions' : 'Save policy'
        }
        busyLabel="Saving…"
        cancelLabel="Cancel"
        busy={mutation.busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void mutation.run(
            async () => {
              if (confirm === 'clean' && preview) {
                await cleanRetainedVersions({
                  data: {
                    slug,
                    keepCount,
                    minAgeDays,
                    expectedIds: preview.candidates.map(
                      (version) => version.id,
                    ),
                  },
                })
                setPreview(null)
              } else if (confirm === 'save')
                await updateRetention({
                  data: { slug, keepCount, minAgeDays, enabled },
                })
              setConfirm(null)
            },
            confirm === 'clean'
              ? 'Versions removed. Storage cleanup is queued.'
              : 'Retention policy saved.',
          )
        }
      />
    </div>
  )
}

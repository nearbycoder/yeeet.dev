import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import {
  getSiteChannelsData,
  getDeploymentInspection,
} from '#/server/functions'
import { requestJson, useConsoleMutation } from '#/lib/console-request'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { CopyButton } from '#/components/copy-button'
import { ManifestDiff } from '#/components/manifest-diff'
import type { ManifestDiffData } from '#/components/manifest-diff'

export const Route = createFileRoute('/dashboard_/sites/$slug/channels')({
  loader: ({ params }) => getSiteChannelsData({ data: { slug: params.slug } }),
  component: Channels,
})
function Channels() {
  const { history, channels } = Route.useLoaderData()
  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [confirm, setConfirm] = useState<{
    name: string
    version?: string
    diff?: ManifestDiffData
  } | null>(null)
  const mutation = useConsoleMutation()
  const ready = history.versions.filter((entry) => entry.status === 'ready')
  const base = `/api/v1/sites/${encodeURIComponent(history.site.slug)}`
  return (
    <section className="panel site-page-panel">
      <div className="panel-heading site-page-heading">
        <div>
          <h2>Channels</h2>
          <p>Keep staging and review URLs separate from production.</p>
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
      <form
        className="console-form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(async () => {
            await requestJson(
              `${base}/channels/${encodeURIComponent(name)}`,
              'PUT',
              { version: version || ready.at(0)?.id },
            )
            setName('')
          }, 'Channel saved. Production was not changed.')
        }}
      >
        <label>
          Channel name
          <input
            required
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            maxLength={24}
            placeholder="staging"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Ready version
          <select
            required
            value={version || ready.at(0)?.id || ''}
            onChange={(event) => setVersion(event.target.value)}
          >
            {ready.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id.slice(0, 8)}
                {entry.current ? ' · Live' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button-ink"
          disabled={mutation.busy || !ready.length}
        >
          Save channel
        </button>
      </form>
      <p className="site-page-note">
        Saving an existing channel name moves that alias to the selected
        version. Deployments remain immutable.
      </p>
      {channels.length ? (
        channels.map((channel) => (
          <article className="console-item" key={channel.id}>
            <h3>{channel.name}</h3>
            <a href={channel.url} target="_blank" rel="noreferrer">
              {channel.url} ↗
            </a>
            <p>
              Version <code>{channel.deploymentId.slice(0, 8)}</code>
            </p>
            <div className="console-actions">
              <CopyButton
                value={channel.url}
                label="Copy channel URL"
                className="button button-paper"
              />
              <Link
                className="button button-paper"
                to="/dashboard"
                search={{ site: history.site.slug, channel: channel.name }}
              >
                Deploy to channel
              </Link>
              <button
                type="button"
                className="button button-paper"
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.run(async () => {
                    const result = await getDeploymentInspection({
                      data: {
                        slug: history.site.slug,
                        version: channel.deploymentId,
                        base: history.site.activeDeploymentId ?? undefined,
                      },
                    })
                    setConfirm({
                      name: channel.name,
                      version: channel.deploymentId,
                      diff: result.comparison ?? undefined,
                    })
                  }, '')
                }
              >
                Review for production
              </button>
              <button
                type="button"
                className="button danger-link"
                disabled={mutation.busy}
                onClick={() => setConfirm({ name: channel.name })}
              >
                Remove channel
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="empty-state">
          No channels yet. Create staging above or deploy a build to a new
          channel.
        </p>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm?.version
            ? `Promote ${confirm.name} to production?`
            : `Remove ${confirm?.name ?? ''}?`
        }
        description={
          <>
            <p>
              {confirm?.version
                ? 'The reviewed version will become live. Existing versions remain available.'
                : 'This channel URL will stop resolving. Its version and production remain available.'}
            </p>
            {confirm?.diff ? <ManifestDiff diff={confirm.diff} /> : null}
          </>
        }
        confirmLabel={confirm?.version ? 'Promote version' : 'Remove channel'}
        busy={mutation.busy}
        busyLabel="Saving…"
        cancelLabel="Cancel"
        tone={confirm?.version ? 'neutral' : 'danger'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return
          void mutation.run(async () => {
            await requestJson(
              confirm.version
                ? `${base}/versions/${confirm.version}/activate`
                : `${base}/channels/${encodeURIComponent(confirm.name)}`,
              confirm.version ? 'POST' : 'DELETE',
            )
            setConfirm(null)
          })
        }}
      />
    </section>
  )
}

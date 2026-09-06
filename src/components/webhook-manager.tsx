import { useState } from 'react'
import { requestJson, useConsoleMutation } from '#/lib/console-request'
import { CopyButton } from './copy-button'
import { ConfirmDialog } from './confirm-dialog'
import type {
  listWebhookEndpoints,
  listWebhookDeliveries,
} from '#/server/webhooks'

type Endpoint = Awaited<ReturnType<typeof listWebhookEndpoints>>[number]
type Delivery = Awaited<ReturnType<typeof listWebhookDeliveries>>[number]
export function WebhookManager({
  webhooks,
  deliveries,
  events,
}: {
  webhooks: Array<Endpoint>
  deliveries: Array<Delivery>
  events: ReadonlyArray<string>
}) {
  const mutation = useConsoleMutation()
  const [editing, setEditing] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [selected, setSelected] = useState<Array<string>>(['*'])
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState<{
    kind: 'delete' | 'rotate' | 'retry'
    id: string
    label: string
  } | null>(null)
  function reset() {
    setEditing(null)
    setLabel('')
    setUrl('')
    setSelected(['*'])
  }
  return (
    <section className="panel site-page-panel" id="webhooks">
      <h2>Webhooks</h2>
      <p>
        Send signed deployment events to your integrations. Up to 20 endpoints.
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
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(async () => {
            const result = await requestJson<{ secret?: string }>(
              editing ? `/api/v1/webhooks/${editing}` : '/api/v1/webhooks',
              editing ? 'PATCH' : 'POST',
              { url, label, events: selected },
            )
            setSecret(result.secret ?? '')
            reset()
          })
        }}
      >
        <div className="console-form-grid">
          <label>
            Webhook name
            <input
              required
              value={label}
              maxLength={100}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Deployment notifications…"
            />
          </label>
          <label>
            Endpoint URL
            <input
              required
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/webhook"
            />
          </label>
        </div>
        <fieldset className="console-checkboxes">
          <legend>Events</legend>
          {['*', ...events].map((name) => (
            <label key={name}>
              <input
                type="checkbox"
                checked={selected.includes(name)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? name === '*'
                        ? ['*']
                        : [...selected.filter((value) => value !== '*'), name]
                      : selected.filter((value) => value !== name),
                  )
                }
              />
              {name === '*' ? 'All events' : name}
            </label>
          ))}
        </fieldset>
        <div className="console-actions">
          <button
            className="button button-ink"
            disabled={mutation.busy || !selected.length}
          >
            {editing ? 'Save webhook' : 'Create webhook'}
          </button>
          {editing ? (
            <button
              type="button"
              className="button button-paper"
              onClick={reset}
            >
              Cancel editing
            </button>
          ) : null}
        </div>
      </form>
      {secret ? (
        <div className="console-item">
          <p>
            Signing secret: shown only now. Update your receiver before closing
            this panel.
          </p>
          <code className="secret-value">{secret}</code>
          <div className="console-actions">
            <CopyButton
              value={secret}
              label="Copy signing secret"
              className="button button-paper"
            />
            <button
              type="button"
              className="button button-paper"
              onClick={() => setSecret('')}
            >
              Hide secret
            </button>
          </div>
        </div>
      ) : null}
      {webhooks.map((hook) => (
        <article className="console-item" key={hook.id}>
          <h3>
            {hook.label} · {hook.active ? 'Active' : 'Paused'}
          </h3>
          <p>{hook.url}</p>
          <p>{hook.events.join(', ')}</p>
          <div className="console-actions">
            <button
              type="button"
              className="button button-paper"
              disabled={mutation.busy}
              onClick={() => {
                setEditing(hook.id)
                setLabel(hook.label)
                setUrl(hook.url)
                setSelected(hook.events)
                document.querySelector('#webhooks')?.scrollIntoView()
              }}
            >
              Edit webhook
            </button>
            <button
              type="button"
              className="button button-paper"
              disabled={mutation.busy}
              onClick={() =>
                void mutation.run(() =>
                  requestJson(`/api/v1/webhooks/${hook.id}`, 'PATCH', {
                    active: !hook.active,
                  }),
                )
              }
            >
              {hook.active ? 'Pause webhook' : 'Resume webhook'}
            </button>
            <button
              type="button"
              className="button button-paper"
              disabled={mutation.busy}
              onClick={() =>
                setConfirm({ kind: 'rotate', id: hook.id, label: hook.label })
              }
            >
              Rotate secret
            </button>
            <button
              type="button"
              className="button danger-link"
              disabled={mutation.busy}
              onClick={() =>
                setConfirm({ kind: 'delete', id: hook.id, label: hook.label })
              }
            >
              Delete webhook
            </button>
          </div>
        </article>
      ))}
      {!webhooks.length ? (
        <p className="empty-state">No webhooks configured.</p>
      ) : null}
      <h3>Recent deliveries</h3>
      <p className="site-page-note">
        Showing the latest 50 deliveries. Pending deliveries retry
        automatically. Failed deliveries can be queued again.
      </p>
      <div className="console-table-scroll">
        <table className="console-table">
          <thead>
            <tr>
              <th>Endpoint / event</th>
              <th>Status</th>
              <th>Attempts / response</th>
              <th>Detail</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((delivery) => (
              <tr key={delivery.id}>
                <td>
                  {webhooks.find((hook) => hook.id === delivery.endpointId)
                    ?.label ?? 'Removed endpoint'}
                  <br />
                  {delivery.event}
                  <br />
                  <small>{new Date(delivery.createdAt).toLocaleString()}</small>
                </td>
                <td>{delivery.status}</td>
                <td>
                  {delivery.attempts} /{' '}
                  {delivery.responseStatus ?? 'No response'}
                </td>
                <td>
                  {delivery.error ??
                    (delivery.deliveredAt
                      ? `Delivered ${new Date(delivery.deliveredAt).toLocaleString()}`
                      : `Next attempt ${new Date(delivery.nextAttemptAt).toLocaleString()}`)}
                </td>
                <td>
                  {delivery.status === 'failed' ? (
                    <button
                      type="button"
                      className="button button-paper"
                      disabled={mutation.busy}
                      onClick={() =>
                        setConfirm({
                          kind: 'retry',
                          id: delivery.id,
                          label: delivery.event,
                        })
                      }
                    >
                      Retry delivery
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!deliveries.length ? (
        <p className="empty-state">
          Delivery history will appear after a subscribed event occurs.
        </p>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={
          confirm
            ? `${confirm.kind === 'delete' ? 'Delete' : confirm.kind === 'rotate' ? 'Rotate secret for' : 'Retry'} ${confirm.label}?`
            : ''
        }
        description={
          confirm?.kind === 'delete'
            ? 'This removes the endpoint and its delivery history.'
            : confirm?.kind === 'rotate'
              ? 'Update your receiver to use the replacement signing secret. The old secret will no longer sign events.'
              : 'The receiver will get another attempt for the same event. Receivers should deduplicate by delivery ID.'
        }
        confirmLabel={
          confirm?.kind === 'delete'
            ? 'Delete webhook'
            : confirm?.kind === 'rotate'
              ? 'Rotate signing secret'
              : 'Queue retry'
        }
        busy={mutation.busy}
        busyLabel="Saving…"
        cancelLabel="Cancel"
        tone={confirm?.kind === 'delete' ? 'danger' : 'neutral'}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void mutation.run(async () => {
            if (!confirm) return
            const result = await requestJson<{ secret?: string }>(
              confirm.kind === 'retry'
                ? `/api/v1/webhooks/deliveries/${confirm.id}/retry`
                : `/api/v1/webhooks/${confirm.id}`,
              confirm.kind === 'delete'
                ? 'DELETE'
                : confirm.kind === 'retry'
                  ? 'POST'
                  : 'PATCH',
              confirm.kind === 'rotate' ? { rotateSecret: true } : undefined,
            )
            setSecret(result.secret ?? '')
            setConfirm(null)
          })
        }
      />
    </section>
  )
}

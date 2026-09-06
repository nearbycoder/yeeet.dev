import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { useConsoleMutation } from '#/lib/console-request'
import { CopyButton } from './copy-button'
import { ConfirmDialog } from './confirm-dialog'
import type { listAccountKeys } from '#/server/account-console'

type Key = Awaited<ReturnType<typeof listAccountKeys>>[number]
function date(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Never'
}
export function ApiKeyManager({ keys }: { keys: Array<Key> }) {
  const mutation = useConsoleMutation()
  const [name, setName] = useState('')
  const [days, setDays] = useState('90')
  const [newKey, setNewKey] = useState('')
  const [remove, setRemove] = useState<Key | null>(null)
  return (
    <section className="panel site-page-panel" id="api-keys">
      <h2>API keys</h2>
      <p>
        Name each integration and revoke its key when it no longer needs access.
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
            const result = await authClient.apiKey.create({
              name,
              prefix: 'yeeet_',
              expiresIn: Number(days) * 86400,
            })
            if (result.error) throw new Error(result.error.message)
            setNewKey(result.data.key)
            setName('')
          }, 'API key created. Copy it before leaving this page.')
        }}
      >
        <label>
          Key name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="CI deployment…"
          />
        </label>
        <label>
          Expires in
          <select
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <button className="button button-ink" disabled={mutation.busy}>
          Create named key
        </button>
      </form>
      {newKey ? (
        <div className="console-item">
          <p>Shown once. Store this key securely.</p>
          <code className="secret-value">{newKey}</code>
          <div className="console-actions">
            <CopyButton
              value={newKey}
              label="Copy new key"
              className="button button-paper"
            />
            <button
              type="button"
              className="button button-paper"
              onClick={() => setNewKey('')}
            >
              Hide key
            </button>
          </div>
        </div>
      ) : null}
      {keys.length ? (
        keys.map((key) => (
          <article className="console-item" key={key.id}>
            <form
              key={`${key.id}-${key.name}`}
              className="console-form-grid"
              onSubmit={(event) => {
                event.preventDefault()
                const form = new FormData(event.currentTarget)
                void mutation.run(async () => {
                  const result = await authClient.apiKey.update({
                    keyId: key.id,
                    name: String(form.get('name')),
                  })
                  if (result.error) throw new Error(result.error.message)
                })
              }}
            >
              <label>
                Key name
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={key.name ?? ''}
                />
              </label>
              <button className="button button-paper" disabled={mutation.busy}>
                Rename key
              </button>
            </form>
            <p>
              <code>{key.start ?? 'yeeet_'}…</code> ·{' '}
              {key.enabled
                ? key.expiresAt && new Date(key.expiresAt) < new Date()
                  ? 'Expired'
                  : 'Enabled'
                : 'Disabled'}
            </p>
            <p>
              Expires: {date(key.expiresAt)} · Last used:{' '}
              {date(key.lastRequest)} · {key.requestCount ?? 0} requests in the
              current rate window
            </p>
            <div className="console-actions">
              <button
                type="button"
                className="button button-paper"
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.run(async () => {
                    const result = await authClient.apiKey.update({
                      keyId: key.id,
                      enabled: !key.enabled,
                    })
                    if (result.error) throw new Error(result.error.message)
                  })
                }
              >
                {key.enabled ? 'Disable key' : 'Enable key'}
              </button>
              <button
                type="button"
                className="button button-paper"
                disabled={mutation.busy}
                onClick={() =>
                  void mutation.run(async () => {
                    const result = await authClient.apiKey.update({
                      keyId: key.id,
                      expiresIn: 90 * 86400,
                    })
                    if (result.error) throw new Error(result.error.message)
                  }, 'Expiry extended to 90 days from now.')
                }
              >
                Extend expiry 90 days
              </button>
              <button
                type="button"
                className="button danger-link"
                disabled={mutation.busy}
                onClick={() => setRemove(key)}
              >
                Revoke key
              </button>
            </div>
          </article>
        ))
      ) : (
        <p className="empty-state">
          No API keys. Create one for your CLI or CI integration.
        </p>
      )}
      <ConfirmDialog
        open={Boolean(remove)}
        title={`Revoke ${remove?.name ?? 'this key'}?`}
        description="Integrations using this key will lose access immediately. This cannot be undone."
        confirmLabel="Revoke key"
        cancelLabel="Cancel"
        busy={mutation.busy}
        onCancel={() => setRemove(null)}
        onConfirm={() =>
          void mutation.run(async () => {
            if (!remove) return
            const result = await authClient.apiKey.delete({ keyId: remove.id })
            if (result.error) throw new Error(result.error.message)
            setRemove(null)
            setNewKey('')
          })
        }
      />
    </section>
  )
}

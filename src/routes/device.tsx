import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { Brand } from '#/components/brand'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/device')({
  validateSearch: z.object({ user_code: z.string().optional() }),
  component: DeviceAuthorization,
})

function DeviceAuthorization() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const [code, setCode] = useState(search.user_code || '')
  const [claimed, setClaimed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function continueWithCode(event: React.FormEvent) {
    event.preventDefault()
    const formatted = code.trim().replaceAll('-', '').toUpperCase()
    if (!session?.user) {
      await navigate({
        to: '/login',
        search: {
          redirect: `/device?user_code=${encodeURIComponent(formatted)}`,
        },
      })
      return
    }
    setBusy(true)
    setMessage('')
    const response = await authClient.device({
      query: { user_code: formatted },
    })
    setBusy(false)
    if (response.error) {
      setMessage(
        response.error.error_description || 'That code is invalid or expired.',
      )
      return
    }
    setCode(formatted)
    setClaimed(true)
  }

  async function decide(approve: boolean) {
    setBusy(true)
    const response = approve
      ? await authClient.device.approve({ userCode: code })
      : await authClient.device.deny({ userCode: code })
    setBusy(false)
    if (response.error) {
      setMessage(
        response.error.error_description || 'Could not update this request.',
      )
      return
    }
    setClaimed(false)
    setMessage(
      approve
        ? 'Approved. You can return to your terminal.'
        : 'Request denied.',
    )
  }

  return (
    <main className="auth-page device-page">
      <div className="auth-top">
        <Brand />
      </div>
      <section className="auth-card">
        <div className="auth-heading">
          <span className="mini-orbit">⌘</span>
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> Device authorization
            </div>
            <h1>Connect the CLI.</h1>
            <p>Approve a terminal or agent that is waiting to yeeet.</p>
          </div>
        </div>
        {!claimed ? (
          <form onSubmit={continueWithCode} className="auth-form">
            <label>
              <span>One-time code</span>
              <input
                className="device-code"
                name="device-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="ABCD-EFGH"
                autoComplete="one-time-code"
                spellCheck={false}
              />
            </label>
            <button
              className="button button-coral auth-submit"
              disabled={busy || isPending || !code}
            >
              {busy ? 'Checking…' : 'Continue →'}
            </button>
          </form>
        ) : (
          <div className="device-approval">
            <code>{code}</code>
            <p>
              <b>{session?.user.name}</b>, this device will be able to create
              and list your deployments.
            </p>
            <div>
              <button
                type="button"
                className="button button-coral"
                onClick={() => decide(true)}
                disabled={busy}
              >
                Approve
              </button>
              <button
                type="button"
                className="button"
                onClick={() => decide(false)}
                disabled={busy}
              >
                Deny
              </button>
            </div>
          </div>
        )}
        {message ? (
          <p
            className={
              message.startsWith('Approved') ? 'form-success' : 'form-error'
            }
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  )
}

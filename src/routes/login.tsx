import { useState } from 'react'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { Brand, GitHubIcon } from '#/components/brand'
import { authClient } from '#/lib/auth-client'
import { getSession } from '#/server/functions'

const searchSchema = z.object({ redirect: z.string().optional() })

export const Route = createFileRoute('/login')({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    if (await getSession()) throw redirect({ to: '/dashboard' })
  },
  component: Login,
})

function Login() {
  const { redirect: redirectTo } = Route.useSearch()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const destination = redirectTo?.startsWith('/') ? redirectTo : '/dashboard'
  const githubEnabled = import.meta.env.VITE_GITHUB_AUTH_ENABLED === 'true'

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const result =
      mode === 'login'
        ? await authClient.signIn.email({ email, password })
        : await fetch('/api/auth/sign-up/email', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-yeeet-invitation': invitationCode,
            },
            body: JSON.stringify({ name, email, password }),
          }).then(async (response) => {
            const data = await response.json()
            return response.ok
              ? { data, error: null }
              : {
                  data: null,
                  error: {
                    message:
                      data.message ||
                      data.error?.message ||
                      'Authentication failed.',
                  },
                }
          })
    setBusy(false)
    if (result.error) {
      setError(result.error.message || 'Authentication failed.')
      return
    }
    window.location.assign(destination)
  }

  async function github() {
    setError('')
    if (mode === 'signup') {
      const response = await fetch('/api/v1/invitations/authorize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: invitationCode }),
      })
      if (!response.ok) {
        const body = await response.json()
        setError(body.error?.message || 'A valid invitation is required.')
        return
      }
    }
    await authClient.signIn.social({
      provider: 'github',
      callbackURL: destination,
    })
  }

  return (
    <main className="auth-page">
      <div className="auth-top">
        <Brand />
      </div>
      <section className="auth-card">
        <div className="auth-heading">
          <span className="mini-orbit">Y!</span>
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> Launch control
            </div>
            <h1>{mode === 'login' ? 'Welcome back.' : 'Join the flight.'}</h1>
            <p>
              {mode === 'login'
                ? 'Your sites have been holding orbit.'
                : 'Your first deployment is less than a minute away.'}
            </p>
          </div>
        </div>

        {githubEnabled ? (
          <>
            <button
              type="button"
              className="button github-button"
              onClick={github}
              disabled={mode === 'signup' && !invitationCode}
            >
              <GitHubIcon /> Continue with GitHub
            </button>
            <div className="auth-divider">
              <span>or use email</span>
            </div>
          </>
        ) : null}

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' ? (
            <>
              <label>
                <span>Invitation code</span>
                <input
                  name="invitation-code"
                  value={invitationCode}
                  onChange={(event) => setInvitationCode(event.target.value)}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="invite_…"
                />
              </label>
              <label>
                <span>Name</span>
                <input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  autoComplete="name"
                  placeholder="e.g. Ada Lovelace…"
                />
              </label>
            </>
          ) : null}
          <label>
            <span>Email</span>
            <input
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="e.g. you@example.com…"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder="At least 8 characters…"
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="button button-coral auth-submit" disabled={busy}>
            {busy
              ? 'Checking trajectory…'
              : mode === 'login'
                ? 'Enter launchpad →'
                : 'Create account →'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login'
            ? 'New around here?'
            : 'Already have a flight plan?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError('')
            }}
          >
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </section>
      <Link to="/" className="auth-back">
        ← Back to earth
      </Link>
    </main>
  )
}

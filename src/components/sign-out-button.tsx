import { useState } from 'react'
import { authClient } from '#/lib/auth-client'

export function SignOutButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <>
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const result = await authClient.signOut()
            if (result.error) {
              setError(result.error.message || 'Could not sign out. Try again.')
              return
            }
            window.location.assign('/')
          } catch {
            setError('Could not sign out. Check your connection and try again.')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {error ? (
        <p className="navigation-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  )
}

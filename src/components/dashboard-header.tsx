import { Link } from '@tanstack/react-router'
import { Brand } from './brand'
import { authClient } from '#/lib/auth-client'

type DashboardUser = {
  name: string
  image?: string | null
  role?: string | null
}

export function DashboardHeader({
  user,
  docsUrl,
}: {
  user: DashboardUser
  docsUrl: string
}) {
  const isAdmin = user.role?.split(',').includes('admin') ?? false

  return (
    <header className="dashboard-header">
      <Brand />
      <nav aria-label="Account navigation">
        <Link to="/dashboard" className="dashboard-home-link">
          Dashboard
        </Link>
        <Link to="/mascot" className="mascot-lab-link">
          Yeeetlings
        </Link>
        <a href={docsUrl} className="agent-docs-link">
          Docs
        </a>
        {isAdmin ? <Link to="/admin">Admin</Link> : null}
        <span className="user-chip">
          <span>
            {user.image ? (
              <img src={user.image} alt="" width="30" height="30" />
            ) : (
              user.name.slice(0, 1).toUpperCase()
            )}
          </span>
          {user.name}
        </span>
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut()
            window.location.assign('/')
          }}
        >
          Sign out
        </button>
      </nav>
    </header>
  )
}

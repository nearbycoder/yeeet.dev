import { SignOutButton } from '#/components/sign-out-button'
import { NavigationMenu } from '#/components/navigation-menu'
import { Link } from '@tanstack/react-router'
import { Brand } from './brand'

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
      <NavigationMenu label="Account navigation">
        <Link
          to="/dashboard"
          className="dashboard-home-link"
          activeProps={{ 'aria-current': 'page' }}
        >
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
        <SignOutButton />
      </NavigationMenu>
    </header>
  )
}

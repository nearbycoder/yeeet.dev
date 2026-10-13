import { useEffect, useId, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { SiteSwitcher } from './site-switcher'
import { SignOutButton } from '#/components/sign-out-button'
import { NavigationMenu } from '#/components/navigation-menu'
import { ThemeToggle } from '#/components/theme-toggle'
import { Brand } from './brand'

type DashboardUser = {
  name: string
  email?: string | null
  image?: string | null
  role?: string | null
}

function sectionFor(pathname: string) {
  if (pathname.startsWith('/dashboard/workspaces')) return 'workspaces'
  if (pathname.startsWith('/dashboard/storage')) return 'storage'
  if (pathname.startsWith('/dashboard/settings')) return 'settings'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'sites'
}

function UserAvatar({ user }: { user: DashboardUser }) {
  return (
    <span className="user-avatar" aria-hidden="true">
      {user.image ? (
        <img src={user.image} alt="" width="32" height="32" />
      ) : (
        user.name.slice(0, 1).toUpperCase()
      )}
    </span>
  )
}

function AccountMenu({
  user,
  docsUrl,
}: {
  user: DashboardUser
  docsUrl: string
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <div
      className={`account-menu ${open ? 'is-open' : ''}`}
      ref={root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="account-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <UserAvatar user={user} />
        <span className="account-name">{user.name}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true" className="account-caret">
          <path d="M3 4.5 6 7.5l3-3" />
        </svg>
      </button>
      <div className="account-panel" id={menuId}>
        <div className="account-identity">
          <UserAvatar user={user} />
          <span>
            <b>{user.name}</b>
            {user.email ? <small>{user.email}</small> : null}
          </span>
        </div>
        <Link to="/dashboard/settings" onClick={() => setOpen(false)}>
          Integrations &amp; settings
        </Link>
        <Link to="/mascot" onClick={() => setOpen(false)}>
          Yeeetling lab
        </Link>
        <a href={docsUrl}>Docs</a>
        <SignOutButton />
      </div>
    </div>
  )
}

export function DashboardHeader({
  user,
  docsUrl,
}: {
  user: DashboardUser
  docsUrl: string
}) {
  const isAdmin = user.role?.split(',').includes('admin') ?? false
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const section = sectionFor(pathname)
  // Router links mark fuzzy matches active, so section state is computed here.
  const current = (name: string) => ({
    activeOptions: { exact: true, includeSearch: false },
    activeProps: { 'aria-current': undefined },
    ...(section === name ? { 'aria-current': 'page' as const } : {}),
  })

  return (
    <header className="dashboard-header">
      <Brand />
      <NavigationMenu label="Console navigation" className="console-nav">
        <div className="console-nav-primary">
          <Link to="/dashboard" {...current('sites')}>
            Sites
          </Link>
          <Link to="/dashboard/workspaces" {...current('workspaces')}>
            Workspaces
          </Link>
          <Link
            to="/dashboard/storage"
            search={{ sort: 'bytes', page: 0 }}
            {...current('storage')}
          >
            Storage
          </Link>
          <Link to="/dashboard/settings" {...current('settings')}>
            Integrations
          </Link>
          {isAdmin ? (
            <Link to="/admin" {...current('admin')}>
              Admin
            </Link>
          ) : null}
        </div>
        <div className="console-nav-tools">
          <SiteSwitcher />
          <ThemeToggle inline />
          <AccountMenu user={user} docsUrl={docsUrl} />
        </div>
      </NavigationMenu>
    </header>
  )
}

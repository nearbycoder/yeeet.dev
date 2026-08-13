import { useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { Brand } from '#/components/brand'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { authClient } from '#/lib/auth-client'
import { getAdminData, getSession } from '#/server/functions'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: '/login', search: { redirect: '/admin' } })
    const role = (session.user as { role?: string }).role
    if (!role?.split(',').includes('admin'))
      throw redirect({ to: '/dashboard' })
    return { user: session.user }
  },
  loader: () => getAdminData(),
  component: Admin,
})

function formatBytes(value: number) {
  const units = ['B', 'KB', 'MB', 'GB']
  const rank = Math.min(
    Math.floor(Math.log(Math.max(value, 1)) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'never'
}

type AdminDeleteTarget = {
  id: string
  slug: string
  ownerEmail: string
  deploymentCount: number
}

async function adminRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(path, init)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error?.message || 'Admin action failed.')
  }
  return data
}

function Admin() {
  const { user } = Route.useRouteContext()
  const data = Route.useLoaderData()
  const router = useRouter()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [newCode, setNewCode] = useState('')
  const [banTarget, setBanTarget] = useState('')
  const [banReason, setBanReason] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AdminDeleteTarget | null>(
    null,
  )

  async function mutate(key: string, action: () => Promise<unknown>) {
    setBusy(key)
    setError('')
    try {
      await action()
      await router.invalidate()
      return true
    } catch (actionError) {
      setError(
        actionError instanceof Error ? actionError.message : 'Action failed.',
      )
      return false
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="dashboard-shell admin-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="dashboard-header">
        <Brand />
        <nav>
          <Link to="/dashboard">Launchpad</Link>
          <span className="admin-badge">ADMIN</span>
          <span className="user-chip">
            <span>{user.name.slice(0, 1).toUpperCase()}</span>
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

      <main className="dashboard-main admin-main" id="main-content">
        <section className="dashboard-intro">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> Platform control
            </div>
            <h1>Mission control.</h1>
            <p>Invitations, accounts, sites, and moderation in one place.</p>
          </div>
        </section>

        {error ? (
          <p className="form-error admin-error" role="alert">
            {error}
          </p>
        ) : null}

        <section className="admin-stats">
          <article>
            <b>{data.counts.users}</b>
            <span>Accounts</span>
          </article>
          <article>
            <b>{data.counts.sites}</b>
            <span>Sites</span>
          </article>
          <article>
            <b>{data.counts.deployments}</b>
            <span>Versions</span>
          </article>
          <article className={data.counts.bannedUsers ? 'has-alert' : ''}>
            <b>{data.counts.bannedUsers}</b>
            <span>Suspended</span>
          </article>
        </section>

        <section className="panel admin-section">
          <div className="panel-heading">
            <div>
              <span>ACCESS CONTROL</span>
              <h2>Invitation codes</h2>
            </div>
          </div>
          <div className="invite-create">
            <input
              name="invitation-label"
              aria-label="Invitation purpose or person"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Purpose or person…"
              maxLength={80}
              autoComplete="off"
            />
            <button
              type="button"
              className="button button-coral"
              disabled={busy === 'invite'}
              onClick={() =>
                mutate('invite', async () => {
                  const invitation = await adminRequest(
                    '/api/v1/admin/invitations',
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ label }),
                    },
                  )
                  setNewCode(invitation.code)
                  setLabel('')
                })
              }
            >
              {busy === 'invite' ? 'Creating…' : 'Create invitation'}
            </button>
          </div>
          {newCode ? (
            <div className="invite-reveal" aria-live="polite">
              <div>
                <span>Shown once</span>
                <code>{newCode}</code>
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(newCode)}
              >
                Copy code
              </button>
            </div>
          ) : null}
          <div className="admin-list">
            {data.invitations.map((invitation) => (
              <div className="admin-row invite-row" key={invitation.id}>
                <span>
                  <b>{invitation.label}</b>
                  <small>{invitation.codeHint}</small>
                </span>
                <span>{invitation.useCount} uses</span>
                <span>Last used {formatDate(invitation.lastUsedAt)}</span>
                <span
                  className={`state-pill ${invitation.active ? 'live' : 'blocked'}`}
                >
                  {invitation.active ? 'active' : 'revoked'}
                </span>
                {invitation.active ? (
                  <button
                    type="button"
                    disabled={busy === invitation.id}
                    onClick={() =>
                      mutate(invitation.id, () =>
                        adminRequest(
                          `/api/v1/admin/invitations/${invitation.id}/revoke`,
                          { method: 'POST' },
                        ),
                      )
                    }
                  >
                    Revoke
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="panel-heading">
            <div>
              <span>PEOPLE</span>
              <h2>Accounts</h2>
            </div>
          </div>
          <div className="admin-list">
            {data.users.map((account) => (
              <div className="admin-user" key={account.id}>
                <div className="admin-row user-row">
                  <span>
                    <b>{account.name}</b>
                    <small>{account.email}</small>
                  </span>
                  <span>{account.siteCount} sites</span>
                  <span>Joined {formatDate(account.createdAt)}</span>
                  <span
                    className={`state-pill ${account.banned ? 'blocked' : account.role === 'admin' ? 'admin' : 'live'}`}
                  >
                    {account.banned ? 'suspended' : account.role}
                  </span>
                  <span className="row-actions">
                    {account.id !== user.id ? (
                      <button
                        type="button"
                        onClick={() =>
                          mutate(`role-${account.id}`, () =>
                            adminRequest(
                              `/api/v1/admin/users/${account.id}/role`,
                              {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                  role:
                                    account.role === 'admin' ? 'user' : 'admin',
                                }),
                              },
                            ),
                          )
                        }
                      >
                        {account.role === 'admin' ? 'Demote' : 'Make admin'}
                      </button>
                    ) : null}
                    {account.banned ? (
                      <button
                        type="button"
                        onClick={() =>
                          mutate(`unban-${account.id}`, () =>
                            adminRequest(
                              `/api/v1/admin/users/${account.id}/unban`,
                              { method: 'POST' },
                            ),
                          )
                        }
                      >
                        Reinstate
                      </button>
                    ) : account.role !== 'admin' ? (
                      <button
                        type="button"
                        className="danger-link"
                        onClick={() => {
                          setBanTarget(account.id)
                          setBanReason('')
                        }}
                      >
                        Suspend
                      </button>
                    ) : null}
                  </span>
                </div>
                {account.banReason ? (
                  <p className="ban-note">Reason: {account.banReason}</p>
                ) : null}
                {banTarget === account.id ? (
                  <div className="ban-form">
                    <input
                      name={`ban-reason-${account.id}`}
                      aria-label={`Suspension reason for ${account.name}`}
                      value={banReason}
                      onChange={(event) => setBanReason(event.target.value)}
                      placeholder="Reason for suspension…"
                      maxLength={500}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="button danger-button"
                      onClick={() =>
                        mutate(`ban-${account.id}`, async () => {
                          await adminRequest(
                            `/api/v1/admin/users/${account.id}/ban`,
                            {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({ reason: banReason }),
                            },
                          )
                          setBanTarget('')
                        })
                      }
                    >
                      Confirm suspension
                    </button>
                    <button type="button" onClick={() => setBanTarget('')}>
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel admin-section">
          <div className="panel-heading">
            <div>
              <span>CONTENT</span>
              <h2>All static sites</h2>
            </div>
          </div>
          <div className="admin-list">
            {data.sites.map((site) => (
              <div className="admin-row site-admin-row" key={site.id}>
                <a href={site.url} target="_blank" rel="noreferrer">
                  <b>{site.slug}</b>
                  <small>{site.ownerEmail}</small>
                </a>
                <span>{site.deploymentCount} versions</span>
                <span>{formatBytes(site.totalBytes)}</span>
                <span>Updated {formatDate(site.updatedAt)}</span>
                <button
                  type="button"
                  className="danger-link"
                  disabled={busy === `site-${site.id}`}
                  onClick={() => setDeleteTarget(site)}
                >
                  Delete site
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="panel admin-section audit-section">
          <div className="panel-heading">
            <div>
              <span>ACCOUNTABILITY</span>
              <h2>Moderation log</h2>
            </div>
          </div>
          <div className="admin-list">
            {data.events.map((event) => (
              <div className="admin-row audit-row" key={event.id}>
                <b>{event.action}</b>
                <code>{event.targetUserId?.slice(0, 8) || 'platform'}</code>
                <span>
                  {event.details ? JSON.stringify(event.details) : '—'}
                </span>
                <time>{formatDate(event.createdAt)}</time>
              </div>
            ))}
          </div>
        </section>
      </main>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.slug}?` : ''}
        description={
          deleteTarget
            ? `This removes all ${deleteTarget.deploymentCount} versions owned by ${deleteTarget.ownerEmail}, their stored files, and every custom-domain mapping. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete site as admin"
        busy={Boolean(deleteTarget && busy === `site-${deleteTarget.id}`)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget
          if (!target) return
          void mutate(`site-${target.id}`, () =>
            adminRequest(`/api/v1/admin/sites/${target.id}`, {
              method: 'DELETE',
            }),
          ).then((deleted) => {
            if (deleted) setDeleteTarget(null)
          })
        }}
      />
    </div>
  )
}

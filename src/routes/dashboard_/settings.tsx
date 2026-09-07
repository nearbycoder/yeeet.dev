import { SessionManager } from '#/components/session-manager'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardHeader } from '#/components/dashboard-header'
import { ApiKeyManager } from '#/components/api-key-manager'
import { WebhookManager } from '#/components/webhook-manager'
import { getAccountConsoleData, getSession } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/settings')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({
        to: '/login',
        search: { redirect: '/dashboard/settings' },
      })
    return { user: session.user }
  },
  loader: () => getAccountConsoleData(),
  component: AccountSettings,
})
function AccountSettings() {
  const data = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />
      <main id="main-content" tabIndex={-1} className="dashboard-main">
        <div className="dashboard-intro">
          <div>
            <h1>Integrations</h1>
            <p>Manage account access and deployment events.</p>
          </div>
        </div>
        <nav className="console-actions" aria-label="Integration sections">
          <a href="#sessions">Browser sessions</a>
          <a href="#api-keys">API keys</a>
          <a href="#webhooks">Webhooks</a>
        </nav>
        <div className="site-page-stack">
          <SessionManager />
          <ApiKeyManager keys={data.keys} />
          <WebhookManager
            webhooks={data.webhooks}
            deliveries={data.deliveries}
            events={data.events}
          />
        </div>
      </main>
    </div>
  )
}

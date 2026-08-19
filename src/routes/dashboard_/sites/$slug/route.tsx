import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { DashboardHeader } from '#/components/dashboard-header'
import { Yeeetling, getYeeetlingDesign } from '#/components/yeeetling'
import { getSession, getSiteWorkspaceData } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug')({
  beforeLoad: async ({ params }) => {
    const session = await getSession()
    if (!session) {
      throw redirect({
        to: '/login',
        search: { redirect: `/dashboard/sites/${params.slug}` },
      })
    }
    return { user: session.user }
  },
  loader: ({ params }) => getSiteWorkspaceData({ data: { slug: params.slug } }),
  component: SiteLayout,
})

function SiteLayout() {
  const { user } = Route.useRouteContext()
  const { platform, site } = Route.useLoaderData()
  const mascot = getYeeetlingDesign(site.slug)

  return (
    <div className="dashboard-shell site-workspace-shell">
      <a className="skip-link" href="#site-content">
        Skip to site content
      </a>
      <DashboardHeader user={user} docsUrl={platform.docsUrl} />
      <main className="site-workspace" id="site-content">
        <Link className="site-back-link" to="/dashboard">
          ← All sites
        </Link>
        <section className="site-hero">
          <div className="site-hero-identity">
            <Yeeetling
              seed={site.slug}
              compact
              label={`${mascot.name}, ${site.slug}’s Yeeetling`}
            />
            <div>
              <span>Site control</span>
              <h1>{site.slug}</h1>
              <a href={site.url} target="_blank" rel="noreferrer">
                {site.slug}.{platform.siteDomain} ↗
              </a>
            </div>
          </div>
          <div className="site-hero-status">
            <span className="state-pill live">
              <i /> {site.activeDeploymentId ? 'Live' : 'No live version'}
            </span>
            <small>
              {site.protected ? 'Private sharing' : 'Public'} ·{' '}
              {site.spaFallback ? 'SPA routing' : 'Static routing'}
            </small>
          </div>
        </section>

        <nav className="site-section-nav" aria-label={`${site.slug} sections`}>
          <Link
            to="/dashboard/sites/$slug"
            params={{ slug: site.slug }}
            activeOptions={{ exact: true }}
            activeProps={{ 'aria-current': 'page' }}
          >
            Overview
          </Link>
          <Link
            to="/dashboard/sites/$slug/versions"
            params={{ slug: site.slug }}
            activeProps={{ 'aria-current': 'page' }}
          >
            Versions
          </Link>
          <Link
            to="/dashboard/sites/$slug/domains"
            params={{ slug: site.slug }}
            activeProps={{ 'aria-current': 'page' }}
          >
            Domains
            {site.customDomains.length ? (
              <span>{site.customDomains.length}</span>
            ) : null}
          </Link>
          <Link
            to="/dashboard/sites/$slug/analytics"
            params={{ slug: site.slug }}
            activeProps={{ 'aria-current': 'page' }}
          >
            Analytics
          </Link>
        </nav>
        <Outlet />
      </main>
    </div>
  )
}

import { Link, createFileRoute } from '@tanstack/react-router'
import { Route as SiteRoute } from './route'

export const Route = createFileRoute('/dashboard_/sites/$slug/')({
  component: SiteOverview,
})

function formatBytes(value: number | null) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const rank = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function SiteOverview() {
  const { site, latestVersions } = SiteRoute.useLoaderData()

  return (
    <div className="site-page-stack">
      <section className="site-metrics" aria-label="Site summary">
        <article>
          <span>Active payload</span>
          <strong>{formatBytes(site.totalBytes)}</strong>
          <small>{site.fileCount ?? 0} files at the edge</small>
        </article>
        <article>
          <span>Routing</span>
          <strong>{site.spaFallback ? 'SPA' : 'Static'}</strong>
          <small>
            {site.spaFallback
              ? 'Client routes fall back to index.html'
              : 'Only uploaded paths resolve'}
          </small>
        </article>
        <article>
          <span>Access</span>
          <strong>{site.protected ? 'Private' : 'Public'}</strong>
          <small>
            {site.protected
              ? 'Password and share link enabled'
              : 'Available to everyone'}
          </small>
        </article>
        <article>
          <span>Domains</span>
          <strong>{site.customDomains.length}</strong>
          <small>
            {site.customDomains.length === 1
              ? 'Custom hostname attached'
              : 'Custom hostnames attached'}
          </small>
        </article>
      </section>

      <div className="site-overview-grid">
        <section className="panel site-overview-panel">
          <div className="panel-heading site-page-heading">
            <div>
              <span>RECENT VERSIONS</span>
              <h2>Latest launches</h2>
            </div>
            <Link
              to="/dashboard/sites/$slug/versions"
              params={{ slug: site.slug }}
            >
              View all →
            </Link>
          </div>
          {latestVersions.length ? (
            <div className="site-version-preview-list">
              {latestVersions.map((version) => (
                <article key={version.id}>
                  <span
                    className={`activity-status ${version.status}`}
                    aria-hidden="true"
                  >
                    {version.status === 'ready'
                      ? '✓'
                      : version.status === 'failed'
                        ? '!'
                        : '↑'}
                  </span>
                  <div>
                    <b>{version.id.slice(0, 8)}</b>
                    <small>
                      {version.source} · {formatDate(version.createdAt)}
                    </small>
                  </div>
                  <span
                    className={`state-pill ${version.current ? 'live' : ''}`}
                  >
                    {version.current ? 'Live' : version.status}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No versions remain for this site.</p>
          )}
        </section>

        <aside className="panel site-quick-actions">
          <div className="panel-heading site-page-heading">
            <div>
              <span>QUICK ACTIONS</span>
              <h2>Keep it moving</h2>
            </div>
          </div>
          <a
            className="button button-ink"
            href={site.url}
            target="_blank"
            rel="noreferrer"
          >
            Open live site ↗
          </a>
          <Link
            className="button button-paper"
            to="/dashboard/sites/$slug/versions"
            params={{ slug: site.slug }}
          >
            Manage versions
          </Link>
          <Link
            className="button button-paper"
            to="/dashboard/sites/$slug/domains"
            params={{ slug: site.slug }}
          >
            Connect a domain
          </Link>
          <p>Last updated {formatDate(site.updatedAt)}.</p>
        </aside>
      </div>
    </div>
  )
}

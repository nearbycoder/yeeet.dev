import { createFileRoute } from '@tanstack/react-router'
import { getSiteAnalyticsData } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug/analytics')({
  loader: ({ params }) =>
    getSiteAnalyticsData({ data: { slug: params.slug, days: 30 } }),
  component: SiteAnalytics,
})

function SiteAnalytics() {
  const data = Route.useLoaderData()
  const maxViews = Math.max(...data.daily.map((day) => day.views), 1)

  return (
    <div className="site-page-stack">
      <section className="site-analytics-summary" aria-label="Traffic summary">
        <article>
          <span>Page views</span>
          <strong>{data.totalViews.toLocaleString()}</strong>
          <small>Last {data.period.days} days</small>
        </article>
        <article>
          <span>Successful</span>
          <strong>{data.statuses.successful.toLocaleString()}</strong>
          <small>2xx responses</small>
        </article>
        <article>
          <span>Redirects</span>
          <strong>{data.statuses.redirects.toLocaleString()}</strong>
          <small>3xx responses</small>
        </article>
        <article>
          <span>Errors</span>
          <strong>{data.statuses.errors.toLocaleString()}</strong>
          <small>4xx and 5xx responses</small>
        </article>
      </section>

      <div className="site-analytics-grid">
        <section
          className="panel site-page-panel"
          aria-labelledby="traffic-heading"
        >
          <div className="panel-heading site-page-heading">
            <div>
              <span>PRIVACY-FIRST ANALYTICS</span>
              <h2 id="traffic-heading">Traffic over time</h2>
              <p>Daily aggregate page views in UTC.</p>
            </div>
          </div>
          <div className="site-analytics-chart">
            {data.daily.map((day) => (
              <div className="site-analytics-day" key={day.date}>
                <time dateTime={day.date}>
                  {new Date(`${day.date}T00:00:00Z`).toLocaleDateString(
                    undefined,
                    { month: 'short', day: 'numeric', timeZone: 'UTC' },
                  )}
                </time>
                <span aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max((day.views / maxViews) * 100, day.views ? 3 : 0)}%`,
                    }}
                  />
                </span>
                <b>{day.views.toLocaleString()}</b>
              </div>
            ))}
          </div>
        </section>

        <section
          className="panel site-page-panel"
          aria-labelledby="paths-heading"
        >
          <div className="panel-heading site-page-heading">
            <div>
              <span>NORMALIZED ROUTES</span>
              <h2 id="paths-heading">Top paths</h2>
              <p>Your most-requested pages for this period.</p>
            </div>
          </div>
          {data.topPaths.length ? (
            <div className="site-top-paths">
              {data.topPaths.map((item, index) => (
                <div key={item.path}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <code>{item.path}</code>
                  <b>{item.views.toLocaleString()}</b>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No page views yet. Open the live site to start the chart.
            </div>
          )}
        </section>
      </div>

      <section className="panel site-privacy-note">
        <div>
          <span>NO TRACKING PIXELS</span>
          <h2>Useful numbers, no visitor profiles.</h2>
          <p>
            Yeeet records aggregate request counts at the edge. It does not use
            analytics cookies or build an identity for anyone visiting your
            site.
          </p>
        </div>
        <div>
          <section>
            <b>Stored</b>
            <p>{data.privacy.stored.join(' · ')}</p>
          </section>
          <section>
            <b>Never stored</b>
            <p>{data.privacy.notStored.join(' · ')}</p>
          </section>
        </div>
      </section>
    </div>
  )
}

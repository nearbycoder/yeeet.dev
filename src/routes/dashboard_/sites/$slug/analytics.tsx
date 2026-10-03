import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { DownloadButton } from '#/components/download-button'
import {
  aggregateWeeks,
  analyticsCsv,
  periodChange,
} from '#/lib/analytics-report'
import { getSiteAnalyticsData } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/sites/$slug/analytics')({
  validateSearch: z.object({
    days: z.coerce
      .number()
      .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
      .optional()
      .catch(30),
  }),
  loaderDeps: ({ search }) => ({ days: search.days ?? 30 }),
  loader: ({ params, deps }) =>
    getSiteAnalyticsData({ data: { slug: params.slug, days: deps.days } }),
  component: SiteAnalytics,
})

function SiteAnalytics() {
  const data = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [interval, setInterval] = useState<'day' | 'week'>('day')
  const chart = interval === 'week' ? aggregateWeeks(data.daily) : data.daily
  const maxViews = Math.max(...chart.map((day) => day.views), 1)

  return (
    <div className="site-page-stack">
      <div className="analytics-toolbar">
        <div
          className="segmented-control"
          role="group"
          aria-label="Analytics period"
        >
          {([7, 30, 90] as const).map((days) => (
            <button
              key={days}
              aria-pressed={data.period.days === days}
              onClick={() =>
                void navigate({ search: { days }, resetScroll: false })
              }
            >
              {days} days
            </button>
          ))}
        </div>
        <div className="console-actions">
          <DownloadButton
            name={`${data.site.slug}-analytics-${data.period.from}.csv`}
            type="text/csv;charset=utf-8"
            content={() => analyticsCsv(data)}
          >
            Export analytics CSV
          </DownloadButton>
          <DownloadButton
            name={`${data.site.slug}-analytics-${data.period.from}.json`}
            type="application/json"
            content={() => JSON.stringify(data, null, 2)}
          >
            Export analytics JSON
          </DownloadButton>
        </div>
      </div>
      <p className="site-page-note">
        {data.period.from}–{data.period.to} UTC · Includes today’s partial
        totals. Top paths includes at most 20 normalized paths.
      </p>
      <section className="site-analytics-summary" aria-label="Traffic summary">
        <article>
          <span>Page views</span>
          <strong>{data.totalViews.toLocaleString()}</strong>
          <small>Last {data.period.days} days</small>
          <small>
            {periodChange(data.totalViews, data.comparison.totalViews)} from
            previous period
          </small>
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

      <section
        className="comparison-summary"
        aria-label="Previous period comparison"
      >
        <div>
          <strong>Previous {data.period.days} days</strong>
          <span>
            {data.comparison.period.from}–{data.comparison.period.to} UTC
          </span>
        </div>
        <div>
          <b>{data.comparison.totalViews.toLocaleString()}</b>
          <span>page views</span>
        </div>
        <div>
          <b>
            {data.totalViews
              ? ((data.statuses.errors / data.totalViews) * 100).toFixed(1)
              : '0.0'}
            %
          </b>
          <span>current error rate</span>
        </div>
        <div>
          <b>
            {data.comparison.totalViews
              ? (
                  (data.comparison.statuses.errors /
                    data.comparison.totalViews) *
                  100
                ).toFixed(1)
              : '0.0'}
            %
          </b>
          <span>previous error rate</span>
        </div>
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
          <div
            className="segmented-control"
            role="group"
            aria-label="Traffic aggregation"
          >
            <button
              aria-pressed={interval === 'day'}
              onClick={() => setInterval('day')}
            >
              Daily
            </button>
            <button
              aria-pressed={interval === 'week'}
              onClick={() => setInterval('week')}
            >
              Weekly
            </button>
          </div>
          <p className="site-page-note">
            {interval === 'week'
              ? 'Weeks begin Monday in UTC. First and last weeks may be partial.'
              : 'Each row is one UTC day.'}
          </p>
          <div className="site-analytics-chart">
            {chart.map((day) => (
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

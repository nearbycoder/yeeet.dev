import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import {
  getDeploymentInspection,
  getSiteVersionsData,
} from '#/server/functions'
import { ManifestDiff } from '#/components/manifest-diff'

export const Route = createFileRoute('/dashboard_/sites/$slug/inspect')({
  validateSearch: z.object({
    version: z.string().optional(),
    base: z.string().optional(),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const history = await getSiteVersionsData({
      data: { slug: params.slug, version: deps.version },
    })
    const version = deps.version ?? history.versions[0]?.id
    return {
      history,
      detail: version
        ? await getDeploymentInspection({
            data: { slug: params.slug, version, base: deps.base },
          })
        : null,
    }
  },
  component: Inspector,
})

function Inspector() {
  const { history, detail } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [query, setQuery] = useState('')
  const version = detail?.version
  return (
    <section className="panel site-page-panel">
      <div className="panel-heading site-page-heading">
        <div>
          <h2>Deployment inspector</h2>
          <p>Inspect files and rules, or compare any two versions.</p>
        </div>
      </div>
      <div className="console-form-grid">
        <label>
          Version
          <select
            value={version?.id ?? ''}
            onChange={(event) =>
              void navigate({
                search: { ...search, version: event.target.value },
              })
            }
          >
            {history.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id.slice(0, 8)} · {v.status}
                {v.current ? ' · Live' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Compare against
          <select
            value={search.base ?? ''}
            onChange={(event) =>
              void navigate({
                search: { ...search, base: event.target.value || undefined },
              })
            }
          >
            <option value="">No comparison</option>
            {search.base &&
            !history.versions.some((v) => v.id === search.base) ? (
              <option value={search.base}>{search.base.slice(0, 8)}</option>
            ) : null}
            {history.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id.slice(0, 8)}
                {v.current ? ' · Live' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {version ? (
        <>
          <p>
            <code>{version.id}</code> · {version.status} · {version.source} ·{' '}
            {version.fileCount} files
          </p>
          {version.error ? (
            <p className="form-error" role="alert">
              {version.error} Check the reported file and deploy a corrected
              build.
            </p>
          ) : null}
          <p>
            Started {new Date(version.createdAt).toLocaleString()}
            {version.completedAt
              ? ` · Completed ${new Date(version.completedAt).toLocaleString()}`
              : ''}
          </p>
          {detail.comparison ? (
            <>
              <h3>Changes from the comparison version</h3>
              <ManifestDiff diff={detail.comparison} />
              <p>
                {detail.comparison.routingChanged
                  ? 'SPA routing changes. '
                  : ''}
                {detail.comparison.headersChanged
                  ? 'Header rules change. '
                  : ''}
                {detail.comparison.redirectsChanged
                  ? 'Redirect rules change.'
                  : ''}
              </p>
            </>
          ) : null}
          <details>
            <summary>Routing and delivery rules</summary>
            <p>
              {version.spaFallback ? 'SPA fallback enabled' : 'Static routing'}
            </p>
            <h4>Headers</h4>
            <pre className="console-code">
              {JSON.stringify(JSON.parse(version.headerRules), null, 2)}
            </pre>
            <h4>Redirects</h4>
            <pre className="console-code">
              {JSON.stringify(JSON.parse(version.redirectRules), null, 2)}
            </pre>
          </details>
          <label className="console-search">
            Find a file
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="File path…"
            />
          </label>
          <div className="console-table-scroll">
            <table className="console-table">
              <thead>
                <tr>
                  <th>Path</th>
                  <th>Size</th>
                  <th>Type</th>
                  <th>SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {version.files
                  .filter((file) =>
                    file.path.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((file) => (
                    <tr key={file.path}>
                      <td>
                        <code>{file.path}</code>
                      </td>
                      <td>{file.size} B</td>
                      <td>{file.contentType}</td>
                      <td>
                        <code>{file.checksum ?? 'Not recorded'}</code>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Link
            className="button button-paper"
            to="/dashboard/sites/$slug/versions"
            params={{ slug: history.site.slug }}
          >
            Manage versions
          </Link>
        </>
      ) : (
        <p className="empty-state">Deploy a build to inspect its files.</p>
      )}
    </section>
  )
}

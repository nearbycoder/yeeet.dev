import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DashboardHeader } from '#/components/dashboard-header'
import { DownloadButton } from '#/components/download-button'
import { formatBytes, formatNumber } from '#/lib/format'
import { storageSearchSchema } from '#/lib/storage-inventory'
import { toCsv } from '#/lib/download'
import { getSession, getStorageInventory } from '#/server/functions'

export const Route = createFileRoute('/dashboard_/storage')({
  validateSearch: storageSearchSchema,
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({
        to: '/login',
        search: { redirect: '/dashboard/storage' },
      })
    return { user: session.user }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getStorageInventory({ data: deps }),
  component: StorageInventory,
})
function StorageInventory() {
  const data = Route.useLoaderData(),
    search = Route.useSearch(),
    { user } = Route.useRouteContext(),
    navigate = Route.useNavigate()
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />
      <main id="main-content" tabIndex={-1} className="dashboard-main">
        <section className="dashboard-intro">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> Cargo hold
            </div>
            <h1>Storage inventory</h1>
            <p>
              Recorded deployment bytes across your sites and all retained
              versions.
            </p>
          </div>
        </section>
        <div className="site-metrics storage-metrics">
          <article>
            <span>Recorded bytes</span>
            <strong>{formatBytes(data.totalBytes)}</strong>
            <small>{formatNumber(data.totalBytes)} bytes</small>
          </article>
          <article>
            <span>Versions</span>
            <strong>{formatNumber(data.totalVersions)}</strong>
            <small>Across your account</small>
          </article>
        </div>
        <p className="page-footnote">
          Manifest totals include failed and uploading versions and may count
          shared files more than once; they are not a storage-provider bill or
          physical disk measurement.
        </p>
        <form
          className="site-filters"
          key={JSON.stringify(search)}
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            void navigate({
              search: {
                q: String(form.get('q') || '') || undefined,
                sort: form.get('sort') as 'bytes' | 'versions' | 'name',
                page: 0,
              },
            })
          }}
        >
          <label className="console-field">
            Find a site
            <input
              name="q"
              defaultValue={search.q}
              maxLength={200}
              placeholder="Site name…"
            />
          </label>
          <label className="console-field">
            Sort inventory
            <select name="sort" defaultValue={search.sort}>
              <option value="bytes">Most bytes</option>
              <option value="versions">Most versions</option>
              <option value="name">Site name</option>
            </select>
          </label>
          <button className="button button-ink">Apply inventory filters</button>
          <button
            type="button"
            className="button button-paper"
            onClick={() =>
              void navigate({ search: { sort: 'bytes', page: 0 } })
            }
          >
            Reset inventory filters
          </button>
        </form>
        <p role="status">
          Page {data.page + 1} · {data.rows.length} of {data.totalSites}{' '}
          matching sites
        </p>
        <DownloadButton
          name="yeeet-storage-page.csv"
          disabled={!data.rows.length}
          type="text/csv;charset=utf-8"
          content={() =>
            toCsv([
              ['Site', 'Recorded bytes', 'Versions'],
              ...data.rows.map((row) => [row.slug, row.bytes, row.versions]),
            ])
          }
        >
          Export this page as CSV
        </DownloadButton>
        <div className="console-table-scroll">
          <table className="console-table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Recorded bytes</th>
                <th scope="col">Versions</th>
                <th scope="col">Manage</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link
                      to="/dashboard/sites/$slug"
                      params={{ slug: row.slug }}
                    >
                      {row.slug}
                    </Link>
                  </td>
                  <td>{formatNumber(row.bytes)}</td>
                  <td>{formatNumber(row.versions)}</td>
                  <td>
                    <Link
                      to="/dashboard/sites/$slug/cleanup"
                      params={{ slug: row.slug }}
                    >
                      Review cleanup
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.rows.length ? (
          <p>No sites match. Reset filters or create your first deployment.</p>
        ) : null}
        <nav className="console-actions" aria-label="Storage pages">
          <button
            type="button"
            className="button button-paper"
            disabled={data.page === 0}
            onClick={() =>
              void navigate({
                search: { ...search, page: Math.max(0, data.page - 1) },
              })
            }
          >
            Previous storage page
          </button>
          <button
            type="button"
            className="button button-paper"
            disabled={!data.hasMore || data.page >= 10000}
            onClick={() =>
              void navigate({ search: { ...search, page: data.page + 1 } })
            }
          >
            Next storage page
          </button>
        </nav>
      </main>
    </div>
  )
}

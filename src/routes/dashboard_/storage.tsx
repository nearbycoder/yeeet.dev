import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { DashboardHeader } from '#/components/dashboard-header'
import { storageSearchSchema } from '#/lib/storage-inventory'
import { downloadText, toCsv } from '#/lib/download'
import { getSession, getStorageInventory } from '#/server/functions'
import { useState } from 'react'

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
  const [error, setError] = useState('')
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />
      <main id="main-content" tabIndex={-1} className="dashboard-main">
        <h1>Storage inventory</h1>
        <p>
          Recorded deployment bytes across your sites and all retained versions.
          These manifest totals include failed and uploading versions and may
          count shared files more than once; they are not a storage-provider
          bill or physical disk measurement.
        </p>
        <div className="site-metrics storage-metrics">
          <article>
            <strong>{data.totalBytes.toLocaleString()}</strong>
            <span> recorded bytes</span>
          </article>
          <article>
            <strong>{data.totalVersions.toLocaleString()}</strong>
            <span> versions across your account</span>
          </article>
        </div>
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
            <input name="q" defaultValue={search.q} maxLength={200} />
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
        <button
          type="button"
          className="button button-paper"
          disabled={!data.rows.length}
          onClick={() => {
            setError('')
            try {
              downloadText(
                'yeeet-storage-page.csv',
                toCsv([
                  ['Site', 'Recorded bytes', 'Versions'],
                  ...data.rows.map((row) => [
                    row.slug,
                    row.bytes,
                    row.versions,
                  ]),
                ]),
                'text/csv;charset=utf-8',
              )
            } catch {
              setError('Could not create the download. Try again.')
            }
          }}
        >
          Export this page as CSV
        </button>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <div className="console-table-scroll">
          <table className="console-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Recorded bytes</th>
                <th>Versions</th>
                <th>Manage</th>
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
                  <td>{row.bytes.toLocaleString()}</td>
                  <td>{row.versions.toLocaleString()}</td>
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

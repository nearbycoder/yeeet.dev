import { FilePreview } from '#/components/file-preview'
import { canPreviewText } from '#/lib/text-preview'
import { useMemo, useState } from 'react'
import { exploreFiles, fileFamily } from '#/lib/file-explorer'
import type { ManifestFile } from '#/lib/file-explorer'

export function FileExplorer({
  files,
  slug,
  version,
}: {
  files: Array<ManifestFile>
  slug: string
  version: string
}) {
  const [preview, setPreview] = useState('')
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('')
  const [order, setOrder] = useState('path')
  const [page, setPage] = useState(0)
  const matching = useMemo(
    () => exploreFiles(files, query, family, order),
    [files, query, family, order],
  )
  const families = [
    ...new Set(files.map((file) => fileFamily(file.contentType))),
  ].sort()
  const pageSize = 100
  const start = Math.min(
    page * pageSize,
    Math.max(0, Math.ceil(matching.length / pageSize) - 1) * pageSize,
  )
  return (
    <section aria-label="File explorer">
      <div className="console-form-grid">
        <label>
          Find a file
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder="File path…"
          />
        </label>
        <label>
          File type
          <select
            value={family}
            onChange={(event) => {
              setFamily(event.target.value)
              setPage(0)
            }}
          >
            <option value="">All types</option>
            {families.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Sort files
          <select
            value={order}
            onChange={(event) => {
              setOrder(event.target.value)
              setPage(0)
            }}
          >
            <option value="path">Path A–Z</option>
            <option value="largest">Largest first</option>
            <option value="smallest">Smallest first</option>
          </select>
        </label>
      </div>
      <p role="status">
        {matching.length
          ? `${start + 1}–${Math.min(start + pageSize, matching.length)}`
          : '0'}{' '}
        of {matching.length} matching files ·{' '}
        {matching.reduce((sum, file) => sum + file.size, 0).toLocaleString()}{' '}
        bytes
      </p>
      <div className="console-table-scroll">
        <table className="console-table">
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col">Size</th>
              <th scope="col">Type</th>
              <th scope="col">SHA-256</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {matching.slice(start, start + pageSize).map((file) => (
              <tr key={file.path}>
                <td>
                  <code>{file.path}</code>
                </td>
                <td>{file.size.toLocaleString()} B</td>
                <td>{file.contentType}</td>
                <td>
                  <code>{file.checksum ?? 'Not recorded'}</code>
                </td>
                <td>
                  <details>
                    <summary aria-label={`Actions for ${file.path}`}>
                      Actions
                    </summary>
                    {canPreviewText(file.contentType) ? (
                      <button
                        className="button button-paper"
                        onClick={() => setPreview(file.path)}
                        aria-label={`Preview ${file.path}`}
                      >
                        Preview text
                      </button>
                    ) : null}
                    <a
                      className="button button-paper"
                      aria-label={`Download ${file.path}`}
                      href={`/api/v1/sites/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}/file?${new URLSearchParams({ path: file.path, download: '1' })}`}
                      download
                    >
                      Download original
                    </a>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {preview ? (
        <FilePreview
          key={preview}
          slug={slug}
          version={version}
          path={preview}
          onClose={() => setPreview('')}
        />
      ) : null}
      {!matching.length ? (
        <p>
          No files match.{' '}
          <button
            className="button button-paper"
            onClick={() => {
              setQuery('')
              setFamily('')
              setPage(0)
            }}
          >
            Clear file filters
          </button>
        </p>
      ) : null}
      <nav className="console-actions" aria-label="File pages">
        <button
          className="button button-paper"
          disabled={start === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
        >
          Previous files
        </button>
        <button
          className="button button-paper"
          disabled={start + pageSize >= matching.length}
          onClick={() => setPage(page + 1)}
        >
          Next files
        </button>
      </nav>
    </section>
  )
}

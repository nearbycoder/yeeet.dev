import type { FileFilters } from '#/lib/file-filters'
import { fileVersionUrl } from '#/lib/file-version-url'
import { FilePreview } from '#/components/file-preview'
import { canPreviewText } from '#/lib/text-preview'
import { CopyButton } from './copy-button'
import { DownloadButton } from './download-button'
import { toCsv } from '#/lib/download'
import {
  fileDirectories,
  filterFileRange,
  formatBytes,
} from '#/lib/asset-review'
import { useMemo, useState } from 'react'
import { exploreFiles, fileFamily } from '#/lib/file-explorer'
import type { ManifestFile } from '#/lib/file-explorer'

export function FileExplorer({
  files,
  slug,
  version,
  previewUrl,
  filters,
  onBookmark,
}: {
  files: Array<ManifestFile>
  slug: string
  version: string
  previewUrl: string | null
  filters: FileFilters
  onBookmark: (filters: FileFilters) => void
}) {
  const [preview, setPreview] = useState('')
  const [query, setQuery] = useState(filters.fileQuery ?? '')
  const [family, setFamily] = useState<
    Exclude<FileFilters['fileType'], undefined> | ''
  >(filters.fileType ?? '')
  const [order, setOrder] = useState(filters.fileOrder ?? 'path')
  const [page, setPage] = useState(0)
  const [directory, setDirectory] = useState(filters.fileDirectory ?? '')
  const [minimum, setMinimum] = useState(filters.fileMin?.toString() ?? '')
  const [maximum, setMaximum] = useState(filters.fileMax?.toString() ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const directories = useMemo(() => fileDirectories(files), [files])
  const matching = useMemo(
    () =>
      filterFileRange(
        exploreFiles(files, query, family, order),
        directory,
        minimum === '' ? undefined : Number(minimum) * 1024,
        maximum === '' ? undefined : Number(maximum) * 1024,
      ),
    [files, query, family, order, directory, minimum, maximum],
  )
  const selectedFiles = useMemo(
    () => files.filter((file) => selected.has(file.path)),
    [files, selected],
  )
  function selectPaths(paths: Array<string>, include: boolean) {
    setSelected((previous) => {
      const next = new Set(previous)
      for (const path of paths) {
        if (include) next.add(path)
        else next.delete(path)
      }
      return next
    })
  }
  const families = [
    ...new Set(files.map((file) => fileFamily(file.contentType))),
  ].sort()
  const pageSize = 100
  const start = Math.min(
    page * pageSize,
    Math.max(0, Math.ceil(matching.length / pageSize) - 1) * pageSize,
  )
  return (
    <section className="file-explorer" aria-label="File explorer">
      <h3>Files</h3>
      <div className="console-form-grid">
        <label>
          Find a file
          <input
            type="search"
            maxLength={200}
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
              setFamily(event.target.value as typeof family)
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
              setOrder(event.target.value as typeof order)
              setPage(0)
            }}
          >
            <option value="path">Path A–Z</option>
            <option value="largest">Largest first</option>
            <option value="smallest">Smallest first</option>
          </select>
        </label>
        <label>
          Folder
          <select
            value={directory}
            onChange={(event) => {
              setDirectory(event.target.value)
              setPage(0)
            }}
          >
            <option value="">All folders</option>
            {directory && !directories.includes(directory) ? (
              <option value={directory}>{directory}</option>
            ) : null}
            {directories.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum size (KiB)
          <input
            type="number"
            min="0"
            max="1000000000"
            step="any"
            value={minimum}
            onChange={(event) => {
              setMinimum(event.target.value)
              setPage(0)
            }}
            placeholder="No minimum"
          />
        </label>
        <label>
          Maximum size (KiB)
          <input
            type="number"
            min="0"
            max="1000000000"
            step="any"
            value={maximum}
            onChange={(event) => {
              setMaximum(event.target.value)
              setPage(0)
            }}
            placeholder="No maximum"
          />
        </label>
      </div>
      {minimum !== '' && maximum !== '' && Number(minimum) > Number(maximum) ? (
        <p role="alert" className="form-error">
          Minimum size must be no greater than maximum size.
        </p>
      ) : null}
      <div className="console-actions">
        <button
          className="button button-paper"
          onClick={() =>
            onBookmark({
              fileQuery: query || undefined,
              fileType: family || undefined,
              fileOrder: order,
              fileDirectory: directory || undefined,
              fileMin: minimum === '' ? undefined : Number(minimum),
              fileMax: maximum === '' ? undefined : Number(maximum),
            })
          }
        >
          Bookmark these file filters
        </button>
        <small>
          Updates this page’s URL for bookmarking or sharing. Site access is
          still required.
        </small>
      </div>
      <div className="selection-toolbar">
        <span role="status">
          {selected.size} selected ·{' '}
          {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
        </span>
        <button
          className="button button-paper"
          disabled={!matching.length}
          onClick={() =>
            selectPaths(
              matching.map((file) => file.path),
              true,
            )
          }
        >
          Select all matches
        </button>
        <button
          className="button button-paper"
          disabled={!selected.size}
          onClick={() => setSelected(new Set())}
        >
          Clear selection
        </button>
        {selected.size ? (
          <>
            <CopyButton
              className="button button-paper"
              label="Copy selected paths"
              value={selectedFiles.map((file) => file.path).join('\n')}
            />
            <DownloadButton
              name={`${slug}-${version}-selected-files.csv`}
              type="text/csv;charset=utf-8"
              content={() =>
                toCsv([
                  [
                    'site',
                    'version',
                    'path',
                    'bytes',
                    'content_type',
                    'sha256',
                  ],
                  ...selectedFiles.map((file) => [
                    slug,
                    version,
                    file.path,
                    file.size,
                    file.contentType,
                    file.checksum,
                  ]),
                ])
              }
            >
              Export selected CSV
            </DownloadButton>
          </>
        ) : null}
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
              <th scope="col">
                <span className="sr-only">Select files</span>
              </th>
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
                  <input
                    type="checkbox"
                    aria-label={`Select ${file.path}`}
                    checked={selected.has(file.path)}
                    onChange={(event) =>
                      selectPaths([file.path], event.target.checked)
                    }
                  />
                </td>
                <td>
                  <code>{file.path}</code>
                </td>
                <td>{file.size.toLocaleString()} B</td>
                <td>{file.contentType}</td>
                <td>
                  <code
                    className="checksum-value"
                    title={file.checksum ?? undefined}
                  >
                    {file.checksum
                      ? `${file.checksum.slice(0, 12)}…`
                      : 'Not recorded'}
                  </code>
                </td>
                <td>
                  <details className="file-actions-menu">
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
                    {previewUrl &&
                    !['_headers', '_redirects'].includes(file.path) ? (
                      <a
                        className="button button-paper"
                        aria-label={`Open version file ${file.path}`}
                        href={fileVersionUrl(previewUrl, file.path)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open version file
                      </a>
                    ) : null}
                    <CopyButton
                      className="button button-paper"
                      value={file.path}
                      label="Copy path"
                      ariaLabel={`Copy path: ${file.path}`}
                    />
                    {file.checksum ? (
                      <CopyButton
                        className="button button-paper"
                        value={file.checksum}
                        label="Copy checksum"
                        ariaLabel={`Copy checksum: ${file.path}`}
                      />
                    ) : null}
                    {previewUrl &&
                    !['_headers', '_redirects'].includes(file.path) ? (
                      <CopyButton
                        className="button button-paper"
                        value={fileVersionUrl(previewUrl, file.path)}
                        label="Copy version URL"
                        ariaLabel={`Copy version URL: ${file.path}`}
                      />
                    ) : null}
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
              setDirectory('')
              setMinimum('')
              setMaximum('')
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

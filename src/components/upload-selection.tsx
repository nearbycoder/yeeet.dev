import { useState } from 'react'
import type { UploadFile } from '#/lib/browser-upload'

export function UploadSelection({
  original,
  files,
  disabled,
  onChange,
}: {
  original: Array<UploadFile>
  files: Array<UploadFile>
  disabled: boolean
  onChange: (files: Array<UploadFile>) => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const selected = new Set(files.map((file) => file.path))
  const matching = original.filter((file) =>
    file.path.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const start = Math.min(
    page * 100,
    Math.max(0, Math.ceil(matching.length / 100) - 1) * 100,
  )
  function toggle(path: string, include: boolean) {
    if (disabled) return
    const paths = new Set(selected)
    if (include) paths.add(path)
    else paths.delete(path)
    onChange(original.filter((file) => paths.has(file.path)))
  }
  return (
    <details className="console-item">
      <summary>
        Edit upload selection ({files.length} of {original.length} files)
      </summary>
      <p>
        Excluded files stay in this selection so you can restore them. Every
        selection change requires a fresh deployment review.
      </p>
      <label className="console-field">
        Filter selected files
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(0)
          }}
          placeholder="Path…"
        />
      </label>
      <div className="console-actions">
        <button
          className="button button-paper"
          disabled={disabled || files.length === original.length}
          onClick={() => onChange([...original])}
        >
          Restore all files
        </button>
        <button
          className="button button-paper"
          disabled={disabled || !matching.length}
          onClick={() => {
            const paths = new Set(matching.map((file) => file.path))
            onChange(files.filter((file) => !paths.has(file.path)))
          }}
        >
          Exclude matching files
        </button>
      </div>
      <p role="status">
        {files.length} included · {original.length - files.length} excluded ·{' '}
        {files.reduce((sum, item) => sum + item.file.size, 0).toLocaleString()}{' '}
        bytes to review
      </p>
      <ul className="file-paths">
        {matching.slice(start, start + 100).map((item, index) => (
          <li key={`${item.path}:${index}`}>
            <label>
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.has(item.path)}
                onChange={(event) => toggle(item.path, event.target.checked)}
              />{' '}
              {item.path} · {item.file.size.toLocaleString()} B
            </label>
          </li>
        ))}
      </ul>
      {!matching.length ? (
        <p>No matching files. Clear the filter to see your selection.</p>
      ) : null}
      <nav className="console-actions" aria-label="Upload file pages">
        <button
          className="button button-paper"
          disabled={start === 0}
          onClick={() => setPage(Math.max(0, page - 1))}
        >
          Previous selection page
        </button>
        <button
          className="button button-paper"
          disabled={start + 100 >= matching.length}
          onClick={() => setPage(page + 1)}
        >
          Next selection page
        </button>
      </nav>
    </details>
  )
}

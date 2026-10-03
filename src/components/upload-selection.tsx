import { useMemo, useState } from 'react'
import type { UploadFile } from '#/lib/browser-upload'
import { matchingUploadPaths } from '#/lib/upload-rules'
import { formatBytes } from '#/lib/asset-review'

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
  const [rules, setRules] = useState('')
  const [savedHistory, setSavedHistory] = useState({
    original,
    current: files,
    undo: [] as Array<Array<UploadFile>>,
    redo: [] as Array<Array<UploadFile>>,
  })
  const history =
    savedHistory.original === original && savedHistory.current === files
      ? savedHistory
      : { original, current: files, undo: [], redo: [] }
  const rulePreview = useMemo(() => {
    try {
      const paths = new Set(
        matchingUploadPaths(
          files.map((file) => file.path),
          rules,
        ),
      )
      return {
        paths,
        bytes: files.reduce(
          (sum, file) => sum + (paths.has(file.path) ? file.file.size : 0),
          0,
        ),
        error: '',
      }
    } catch (failure) {
      return {
        paths: new Set<string>(),
        bytes: 0,
        error:
          failure instanceof Error
            ? failure.message
            : 'Could not evaluate these patterns.',
      }
    }
  }, [files, rules])
  function change(next: Array<UploadFile>) {
    if (disabled) return
    setSavedHistory({
      original,
      current: next,
      undo: [...history.undo, files].slice(-20),
      redo: [],
    })
    onChange(next)
  }
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
    change(original.filter((file) => paths.has(file.path)))
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
          disabled={disabled || !history.undo.length}
          onClick={() => {
            const next = history.undo.at(-1)
            if (!next) return
            setSavedHistory({
              original,
              current: next,
              undo: history.undo.slice(0, -1),
              redo: [...history.redo, files],
            })
            onChange(next)
          }}
        >
          Undo selection change
        </button>
        <button
          className="button button-paper"
          disabled={disabled || !history.redo.length}
          onClick={() => {
            const next = history.redo.at(-1)
            if (!next) return
            setSavedHistory({
              original,
              current: next,
              undo: [...history.undo, files],
              redo: history.redo.slice(0, -1),
            })
            onChange(next)
          }}
        >
          Redo selection change
        </button>
        <button
          className="button button-paper"
          disabled={disabled || files.length === original.length}
          onClick={() => change([...original])}
        >
          Restore all files
        </button>
        <button
          className="button button-paper"
          disabled={disabled || !matching.length}
          onClick={() => {
            const paths = new Set(matching.map((file) => file.path))
            change(files.filter((file) => !paths.has(file.path)))
          }}
        >
          Exclude matching files
        </button>
      </div>
      <details className="upload-rule-editor">
        <summary>Exclude files by pattern</summary>
        <label className="console-field">
          One glob pattern per line
          <textarea
            value={rules}
            disabled={disabled}
            maxLength={10000}
            rows={4}
            onChange={(event) => setRules(event.target.value)}
            placeholder={'**/*.map\n**/node_modules/**\n.env*'}
          />
        </label>
        <p>
          <code>*</code> matches within a folder; <code>**</code> crosses
          folders; <code>?</code> matches one character. Patterns are
          case-sensitive and start at the build root. Lines starting with # are
          comments.
        </p>
        {rulePreview.error ? (
          <p role="alert" className="form-error">
            {rulePreview.error}
          </p>
        ) : (
          <>
            <p role="status">
              Will exclude {rulePreview.paths.size} included files ·{' '}
              {formatBytes(rulePreview.bytes)}
            </p>
            {rulePreview.paths.size ? (
              <ul className="file-paths">
                {[...rulePreview.paths].slice(0, 100).map((path) => (
                  <li key={path}>
                    <code>{path}</code>
                  </li>
                ))}
              </ul>
            ) : null}
            {rulePreview.paths.size > 100 ? (
              <p>
                First 100 paths shown. All matching included files will be
                excluded.
              </p>
            ) : null}
          </>
        )}
        <button
          className="button button-paper"
          disabled={
            disabled || !rulePreview.paths.size || Boolean(rulePreview.error)
          }
          onClick={() =>
            change(files.filter((file) => !rulePreview.paths.has(file.path)))
          }
        >
          Apply exclusion patterns
        </button>
      </details>
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

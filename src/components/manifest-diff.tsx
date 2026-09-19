import { useMemo, useState } from 'react'

export type ManifestDiffData = {
  added: Array<string>
  changed: Array<string>
  removed: Array<string>
  unchanged: Array<string>
  summary: { uploadBytes: number; unchangedBytes: number }
}
const kinds = ['added', 'changed', 'removed', 'unchanged'] as const
function ChangePaths({
  kind,
  paths,
  total,
}: {
  kind: string
  paths: Array<string>
  total: number
}) {
  const [limit, setLimit] = useState(100)
  return (
    <details>
      <summary>
        {kind} ({paths.length} of {total})
      </summary>
      <ul className="file-paths">
        {paths.slice(0, limit).map((path) => (
          <li key={path}>
            <code>{path}</code>
          </li>
        ))}
      </ul>
      {limit < paths.length ? (
        <button
          className="button button-paper"
          onClick={() => setLimit(limit + 100)}
        >
          Show more {kind} files
        </button>
      ) : null}
    </details>
  )
}
export function ManifestDiff({ diff }: { diff: ManifestDiffData }) {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const matching = useMemo(
    () =>
      kinds.map((kind) => ({
        kind,
        paths: diff[kind].filter((path) =>
          path.toLowerCase().includes(normalized),
        ),
      })),
    [diff, normalized],
  )
  return (
    <div className="manifest-diff">
      <div className="site-metrics" aria-label="File changes">
        {kinds.map((kind) => (
          <article key={kind}>
            <span>{kind}</span>
            <strong>{diff[kind].length}</strong>
          </article>
        ))}
      </div>
      <p className="site-page-note">
        {(diff.summary.uploadBytes / 1024).toFixed(1)} KB of added or changed
        files · {(diff.summary.unchangedBytes / 1024).toFixed(1)} KB unchanged
      </p>
      <label className="console-field">
        Search file changes
        <input
          type="search"
          value={query}
          maxLength={200}
          placeholder="Path…"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p role="status">
        {matching.reduce((sum, group) => sum + group.paths.length, 0)} matching
        paths. Totals above describe the entire comparison.
      </p>
      {matching.map(({ kind, paths }) =>
        paths.length ? (
          <ChangePaths
            key={`${kind}:${normalized}`}
            kind={kind}
            paths={paths}
            total={diff[kind].length}
          />
        ) : null,
      )}
      {!matching.some((group) => group.paths.length) ? (
        <p>No paths match this search.</p>
      ) : null}
    </div>
  )
}

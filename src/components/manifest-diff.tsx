export type ManifestDiffData = {
  added: Array<string>
  changed: Array<string>
  removed: Array<string>
  unchanged: Array<string>
  summary: { uploadBytes: number; unchangedBytes: number }
}

export function ManifestDiff({ diff }: { diff: ManifestDiffData }) {
  return (
    <div className="manifest-diff">
      <div className="site-metrics" aria-label="File changes">
        {(['added', 'changed', 'removed', 'unchanged'] as const).map((kind) => (
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
      {(['added', 'changed', 'removed', 'unchanged'] as const).map((kind) =>
        diff[kind].length ? (
          <details key={kind}>
            <summary>
              {kind} ({diff[kind].length})
            </summary>
            <ul className="file-paths">
              {diff[kind].map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
          </details>
        ) : null,
      )}
    </div>
  )
}

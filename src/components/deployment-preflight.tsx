import { useMemo } from 'react'
import { deploymentPreflight } from '#/lib/deployment-preflight'
import type { UploadFile } from '#/lib/browser-upload'

export function DeploymentPreflight({
  files,
  spa,
  disabled,
  onExclude,
}: {
  files: Array<UploadFile>
  spa: boolean
  disabled: boolean
  onExclude: (paths: Array<string>) => void
}) {
  const report = useMemo(
    () =>
      deploymentPreflight(
        files.map((item) => ({ path: item.path, size: item.file.size })),
        spa,
      ),
    [files, spa],
  )
  const groups = [
    ['Likely private files', report.privatePaths],
    ['Source maps may expose source code', report.sourceMaps],
    ['Dependency folders are usually not build output', report.dependencies],
    ['Empty files', report.empty],
    ['Duplicate paths will be rejected', report.duplicates],
  ] as const
  const count =
    groups.reduce((sum, [, paths]) => sum + paths.length, 0) +
    (report.missingEntry ? 1 : 0)
  return (
    <section className="console-item" aria-label="Deployment preflight">
      <h3>Preflight review</h3>
      <p role="status">
        {count
          ? `${count} findings to review.`
          : 'No filename or entry-page findings.'}
      </p>
      <p>
        Checks filenames and sizes only. This is not a scan of file contents.
      </p>
      {report.missingEntry ? (
        <p className="form-error">
          No root index.html.{' '}
          {spa
            ? 'SPA fallback will have no entry page.'
            : 'The root URL may not resolve; named file URLs can still work.'}
        </p>
      ) : null}
      {groups
        .filter(([, paths]) => paths.length)
        .map(([title, paths]) => (
          <details key={title}>
            <summary>
              {title} ({paths.length})
            </summary>
            <ul className="file-paths">
              {paths.slice(0, 20).map((path, index) => (
                <li key={`${path}:${index}`}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
            {paths.length > 20 ? (
              <p>
                Showing the first 20 paths. Use the selection editor to review
                the rest.
              </p>
            ) : null}
          </details>
        ))}
      {report.privatePaths.length ? (
        <button
          className="button button-paper"
          disabled={disabled}
          onClick={() => onExclude(report.privatePaths)}
        >
          Exclude likely private files
        </button>
      ) : null}
    </section>
  )
}

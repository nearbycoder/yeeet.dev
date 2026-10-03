import { useMemo } from 'react'
import { deploymentPreflight } from '#/lib/deployment-preflight'
import type { ManifestFile } from '#/lib/file-explorer'
import { DownloadButton } from './download-button'

export function DeploymentSafety({
  files,
  spa,
  version,
}: {
  files: Array<ManifestFile>
  spa: boolean
  version: string
}) {
  const report = useMemo(() => deploymentPreflight(files, spa), [files, spa])
  const findings = [
    { label: 'Potentially private filenames', paths: report.privatePaths },
    { label: 'Source maps', paths: report.sourceMaps },
    { label: 'Dependency folders', paths: report.dependencies },
    { label: 'Empty files', paths: report.empty },
  ]
  const count =
    findings.reduce((sum, finding) => sum + finding.paths.length, 0) +
    Number(report.missingEntry)
  return (
    <details className="console-item">
      <summary>
        Deployment safety review{' '}
        <span className="summary-meta">
          {count ? `${count} findings` : 'No filename findings'}
        </span>
      </summary>
      <p>
        Review the files already in this version. Checks use filenames and
        sizes; they do not scan source contents or certify that a build is safe.
      </p>
      {report.missingEntry ? (
        <p className="form-error">
          No root index.html. Review the version’s entry route.
        </p>
      ) : null}
      {findings.map((finding) =>
        finding.paths.length ? (
          <details key={finding.label}>
            <summary>
              {finding.label} ({finding.paths.length})
            </summary>
            <ul className="file-paths">
              {finding.paths.slice(0, 100).map((path) => (
                <li key={path}>
                  <code>{path}</code>
                </li>
              ))}
            </ul>
            {finding.paths.length > 100 ? (
              <p>First 100 shown. Download the report for every path.</p>
            ) : null}
          </details>
        ) : null,
      )}
      {!count ? (
        <p>
          No potentially private filenames, source maps, dependency folders, or
          empty files found.
        </p>
      ) : null}
      <div className="console-actions">
        <DownloadButton
          name={`safety-${version}.json`}
          type="application/json"
          content={() => JSON.stringify({ version, ...report }, null, 2)}
        >
          Download safety report
        </DownloadButton>
      </div>
    </details>
  )
}

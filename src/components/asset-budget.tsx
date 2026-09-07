import { useMemo, useState } from 'react'
import { assetBudget } from '#/lib/asset-budget'
import type { ManifestFile } from '#/lib/file-explorer'

export function AssetBudget({ files }: { files: Array<ManifestFile> }) {
  const [fileKiB, setFileKiB] = useState(512)
  const [totalMiB, setTotalMiB] = useState(10)
  const report = useMemo(
    () => assetBudget(files, fileKiB, totalMiB),
    [files, fileKiB, totalMiB],
  )
  return (
    <details className="console-item">
      <summary>Asset budget review</summary>
      <p>
        Review uncompressed stored bytes. These thresholds are for this review
        and do not block publishing.
      </p>
      <div className="console-form-grid">
        <label>
          Per-file budget (KiB)
          <input
            type="number"
            min={1}
            max={1048576}
            value={fileKiB}
            onChange={(event) =>
              setFileKiB(
                Math.max(1, Math.min(1048576, Number(event.target.value))),
              )
            }
          />
        </label>
        <label>
          Total budget (MiB)
          <input
            type="number"
            min={1}
            max={1048576}
            value={totalMiB}
            onChange={(event) =>
              setTotalMiB(
                Math.max(1, Math.min(1048576, Number(event.target.value))),
              )
            }
          />
        </label>
        <button
          className="button button-paper"
          onClick={() => {
            setFileKiB(512)
            setTotalMiB(10)
          }}
        >
          Reset budgets
        </button>
      </div>
      <p role="status">
        {report.overFiles.length} files exceed the file budget.{' '}
        {report.overTotal
          ? `${report.overTotal.toLocaleString()} bytes over the total budget.`
          : 'Within the total budget.'}
      </p>
      <ul>
        {report.byType.map(([kind, bytes]) => (
          <li key={kind}>
            {kind}: {bytes.toLocaleString()} bytes (
            {report.total ? Math.round((bytes / report.total) * 100) : 0}%)
          </li>
        ))}
      </ul>
      <h4>Ten largest files</h4>
      {report.largest.length ? (
        <ol>
          {report.largest.map((file) => (
            <li key={file.path}>
              <code>{file.path}</code> · {file.size.toLocaleString()} bytes
              {file.size > report.fileLimit ? ' · Over budget' : ''}
            </li>
          ))}
        </ol>
      ) : (
        <p>This version contains no files.</p>
      )}
    </details>
  )
}

import { useState } from 'react'
import type { FileGrowthReport } from '#/lib/file-growth'

function deltaLabel(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()} B`
}
export function FileGrowth({ report }: { report: FileGrowthReport }) {
  const [growthOnly, setGrowthOnly] = useState(true)
  const [limit, setLimit] = useState(20)
  const matching = report.changes.filter(
    (file) => !growthOnly || file.delta > 0,
  )
  return (
    <details className="console-item" aria-label="File size changes">
      <summary>File size changes ({deltaLabel(report.delta)} net)</summary>
      <p>
        Uncompressed bytes: {report.beforeBytes.toLocaleString()} before →{' '}
        {report.afterBytes.toLocaleString()} after. Largest absolute changes
        first; same-size content changes are omitted.
      </p>
      <label>
        <input
          type="checkbox"
          checked={growthOnly}
          onChange={(event) => {
            setGrowthOnly(event.target.checked)
            setLimit(20)
          }}
        />{' '}
        Only show files that grew
      </label>
      <div className="console-table-scroll">
        <table className="console-table">
          <thead>
            <tr>
              <th scope="col">Path</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {matching.slice(0, limit).map((file) => (
              <tr key={file.path}>
                <td>
                  <code>{file.path}</code> · {file.kind}
                </td>
                <td>{file.before.toLocaleString()} B</td>
                <td>{file.after.toLocaleString()} B</td>
                <td>{deltaLabel(file.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!matching.length ? (
        <p>
          No {growthOnly ? 'growing files' : 'file size changes'} in this
          comparison.
        </p>
      ) : (
        <p>
          {Math.min(limit, matching.length)} of {matching.length} size changes
        </p>
      )}
      {limit < matching.length ? (
        <button
          className="button button-paper"
          onClick={() => setLimit(limit + 20)}
        >
          Show more size changes
        </button>
      ) : null}
    </details>
  )
}

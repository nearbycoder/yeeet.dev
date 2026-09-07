import { useState } from 'react'
import { comparisonReport } from '#/lib/comparison-report'
import { downloadText } from '#/lib/download'

export function ComparisonReport({
  site,
  diff,
}: {
  site: string
  diff: Parameters<typeof comparisonReport>[1]
}) {
  const [error, setError] = useState('')
  function save(format: 'json' | 'md') {
    try {
      setError('')
      downloadText(
        `${site}-${diff.target}-comparison.${format}`,
        comparisonReport(site, diff, format),
        format === 'json' ? 'application/json' : 'text/markdown;charset=utf-8',
      )
    } catch {
      setError('Could not prepare the comparison report. Try again.')
    }
  }
  return (
    <div>
      <div className="console-actions">
        <button className="button button-paper" onClick={() => save('md')}>
          Download comparison Markdown
        </button>
        <button className="button button-paper" onClick={() => save('json')}>
          Download comparison JSON
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

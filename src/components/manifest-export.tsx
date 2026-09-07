import { useState } from 'react'
import { downloadText } from '#/lib/download'
import { manifestExport } from '#/lib/manifest-export'

export function ManifestExport({
  slug,
  version,
}: {
  slug: string
  version: Parameters<typeof manifestExport>[1]
}) {
  const [error, setError] = useState('')
  function save(format: 'json' | 'csv') {
    try {
      setError('')
      downloadText(
        `${slug}-${version.id}-manifest.${format}`,
        manifestExport(slug, version, format),
        format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
      )
    } catch {
      setError('Could not prepare the download. Please try again.')
    }
  }
  return (
    <div>
      <div className="console-actions">
        <button className="button button-paper" onClick={() => save('json')}>
          Download manifest JSON
        </button>
        <button className="button button-paper" onClick={() => save('csv')}>
          Download manifest CSV
        </button>
      </div>
      <p>
        Exports include every file in this version, including files hidden by
        explorer filters.
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { assetComposition, formatBytes } from '#/lib/asset-review'
import type { ManifestFile } from '#/lib/file-explorer'
import { DownloadButton } from './download-button'
import { toCsv } from '#/lib/download'

export function AssetComposition({ files }: { files: Array<ManifestFile> }) {
  const [by, setBy] = useState<'folder' | 'type'>('folder')
  const [limit, setLimit] = useState(20)
  const groups = useMemo(() => assetComposition(files, by), [files, by])
  const total = groups.reduce((sum, group) => sum + group.bytes, 0)
  return (
    <details className="console-item">
      <summary>
        Asset composition{' '}
        <span className="summary-meta">
          {formatBytes(total)} across {files.length} files
        </span>
      </summary>
      <p>
        Find where your build’s stored bytes are concentrated. These are
        uncompressed manifest sizes.
      </p>
      <div className="console-actions">
        <label className="inline-field">
          Group assets by
          <select
            value={by}
            onChange={(event) => {
              setBy(event.target.value as typeof by)
              setLimit(20)
            }}
          >
            <option value="folder">Top-level folder</option>
            <option value="type">Content type</option>
          </select>
        </label>
        <DownloadButton
          name={`asset-composition-${by}.csv`}
          type="text/csv;charset=utf-8"
          content={() =>
            toCsv([
              ['group', 'files', 'bytes', 'percent'],
              ...groups.map((group) => [
                group.name,
                group.count,
                group.bytes,
                total ? ((group.bytes / total) * 100).toFixed(2) : '0',
              ]),
            ])
          }
        >
          Export composition CSV
        </DownloadButton>
      </div>
      <ul className="composition-list">
        {groups.slice(0, limit).map((group) => (
          <li key={group.name}>
            <div>
              <code>{group.name}</code>
              <span>
                {group.count} files · {formatBytes(group.bytes)} ·{' '}
                {total ? ((group.bytes / total) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <meter
              min={0}
              max={Math.max(total, 1)}
              value={group.bytes}
              aria-label={`${group.name} bytes`}
            />
          </li>
        ))}
      </ul>
      {limit < groups.length ? (
        <button
          className="button button-paper"
          onClick={() => setLimit(limit + 20)}
        >
          Show more asset groups
        </button>
      ) : null}
      {!groups.length ? <p>No assets in this version.</p> : null}
    </details>
  )
}

import { useMemo, useState } from 'react'
import { duplicateAssets } from '#/lib/duplicate-assets'
import type { ManifestFile } from '#/lib/file-explorer'

export function DuplicateAssets({ files }: { files: Array<ManifestFile> }) {
  const groups = useMemo(() => duplicateAssets(files), [files])
  const [limit, setLimit] = useState(10)
  return (
    <details className="console-item">
      <summary>Duplicate assets ({groups.length} groups)</summary>
      <p>
        Files with the same recorded SHA-256 and byte size. Repeated content
        totals{' '}
        {groups
          .reduce((sum, group) => sum + group.redundantBytes, 0)
          .toLocaleString()}{' '}
        bytes across extra paths. This is a build-size opportunity, not a
        storage billing estimate. Check references before removing files in your
        source build.
      </p>
      {!groups.length ? (
        <p>No duplicate non-empty assets with recorded checksums.</p>
      ) : null}
      {groups.slice(0, limit).map((group) => (
        <details key={group.key}>
          <summary>
            {group.files.length} copies ·{' '}
            {group.redundantBytes.toLocaleString()} repeated bytes ·{' '}
            {group.files[0].path}
          </summary>
          <ul className="file-paths">
            {group.files.slice(0, 100).map((file) => (
              <li key={file.path}>
                <code>{file.path}</code>
              </li>
            ))}
          </ul>
          {group.files.length > 100 ? (
            <p>
              Showing 100 paths. Export the manifest to inspect all copies of
              this checksum: <code>{group.files[0].checksum}</code>.
            </p>
          ) : null}
        </details>
      ))}
      {limit < groups.length ? (
        <button
          className="button button-paper"
          onClick={() => setLimit(limit + 10)}
        >
          Show more duplicate groups
        </button>
      ) : null}
    </details>
  )
}

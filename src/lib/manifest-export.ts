import { toCsv } from './download'
import type { ManifestFile } from './file-explorer'

type ExportVersion = {
  id: string
  source: string
  createdAt: string
  files: Array<ManifestFile>
}
export function manifestExport(
  slug: string,
  version: ExportVersion,
  format: 'json' | 'csv',
) {
  const files = version.files.map(({ path, size, contentType, checksum }) => ({
    path,
    size,
    contentType,
    checksum,
  }))
  return format === 'json'
    ? JSON.stringify(
        {
          schemaVersion: 1,
          site: slug,
          version: version.id,
          source: version.source,
          createdAt: version.createdAt,
          files,
        },
        null,
        2,
      )
    : toCsv([
        ['Site', 'Version', 'Path', 'Bytes', 'Content type', 'SHA-256'],
        ...files.map((file) => [
          slug,
          version.id,
          file.path,
          file.size,
          file.contentType,
          file.checksum,
        ]),
      ])
}

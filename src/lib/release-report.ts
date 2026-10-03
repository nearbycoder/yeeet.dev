import { toCsv } from './download'

export type ReleaseRecord = {
  id: string
  status: string
  source: string
  createdAt: string
  completedAt: string | null
  fileCount: number
  totalBytes: number
  current: boolean
  releaseLabel: string
  releaseNotes: string
  retentionPinned: boolean
}

export function releaseCsv(versions: Array<ReleaseRecord>) {
  return toCsv([
    [
      'version',
      'label',
      'status',
      'source',
      'created_at',
      'completed_at',
      'files',
      'bytes',
      'live',
      'pinned',
      'notes',
    ],
    ...versions.map((version) => [
      version.id,
      version.releaseLabel,
      version.status,
      version.source,
      version.createdAt,
      version.completedAt,
      version.fileCount,
      version.totalBytes,
      String(version.current),
      String(version.retentionPinned),
      version.releaseNotes,
    ]),
  ])
}

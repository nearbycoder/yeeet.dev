import type { ManifestFile } from './file-explorer'

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const rank = Math.min(Math.floor(Math.log2(bytes) / 10), 3)
  return `${(bytes / 1024 ** rank).toFixed(rank ? 1 : 0)} ${['B', 'KiB', 'MiB', 'GiB'][rank]}`
}

export function fileDirectories(files: Array<ManifestFile>) {
  const directories = new Set<string>()
  for (const file of files) {
    const segments = file.path.split('/')
    for (let index = 1; index < segments.length; index++)
      directories.add(segments.slice(0, index).join('/') + '/')
  }
  return [...directories].sort((a, b) => a.localeCompare(b))
}

export function filterFileRange(
  files: Array<ManifestFile>,
  directory: string,
  minimum: number | undefined,
  maximum: number | undefined,
) {
  return files.filter(
    (file) =>
      (!directory || file.path.startsWith(directory)) &&
      (minimum === undefined || file.size >= minimum) &&
      (maximum === undefined || file.size <= maximum),
  )
}

export function assetComposition(
  files: Array<ManifestFile>,
  by: 'folder' | 'type',
) {
  const groups = new Map<
    string,
    { name: string; count: number; bytes: number }
  >()
  for (const file of files) {
    const name =
      by === 'type'
        ? file.contentType
        : file.path.includes('/')
          ? file.path.split('/')[0] + '/'
          : '(root)'
    const group = groups.get(name) ?? { name, count: 0, bytes: 0 }
    group.count++
    group.bytes += file.size
    groups.set(name, group)
  }
  return [...groups.values()].sort(
    (a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name),
  )
}

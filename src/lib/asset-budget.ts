import { fileFamily } from './file-explorer'
import type { ManifestFile } from './file-explorer'

export function assetBudget(
  files: Array<ManifestFile>,
  fileKiB: number,
  totalMiB: number,
) {
  const fileLimit =
    Number.isFinite(fileKiB) && fileKiB > 0 ? fileKiB * 1024 : 512 * 1024
  const totalLimit =
    Number.isFinite(totalMiB) && totalMiB > 0
      ? totalMiB * 1024 * 1024
      : 10 * 1024 * 1024
  const total = files.reduce((sum, file) => sum + file.size, 0)
  const byType = new Map<string, number>()
  for (const file of files) {
    const kind = fileFamily(file.contentType)
    byType.set(kind, (byType.get(kind) ?? 0) + file.size)
  }
  return {
    total,
    totalLimit,
    fileLimit,
    overTotal: Math.max(0, total - totalLimit),
    overFiles: files.filter((file) => file.size > fileLimit),
    largest: [...files]
      .sort((a, b) => b.size - a.size || a.path.localeCompare(b.path))
      .slice(0, 10),
    byType: [...byType].sort((a, b) => b[1] - a[1]),
  }
}

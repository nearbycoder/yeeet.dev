import type { ManifestFile } from './file-explorer'

export function duplicateAssets(files: Array<ManifestFile>) {
  const groups = new Map<string, Array<ManifestFile>>()
  for (const file of files) {
    if (
      !file.checksum ||
      !/^[a-f0-9]{64}$/i.test(file.checksum) ||
      file.size <= 0
    )
      continue
    const key = `${file.checksum.toLowerCase()}:${file.size}`
    const group = groups.get(key) ?? []
    group.push(file)
    groups.set(key, group)
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => ({
      key,
      files: [...members].sort((a, b) => a.path.localeCompare(b.path)),
      redundantBytes: members[0].size * (members.length - 1),
    }))
    .sort(
      (a, b) =>
        b.redundantBytes - a.redundantBytes || a.key.localeCompare(b.key),
    )
}

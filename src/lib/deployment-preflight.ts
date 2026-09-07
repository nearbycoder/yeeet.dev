type Entry = { path: string; size: number }
export function deploymentPreflight(files: Array<Entry>, spa: boolean) {
  const privatePaths = files
    .filter((file) =>
      /(^|\/)(\.env(?:\.[^/]*)?|\.git|\.ssh|id_rsa|id_ed25519)(\/|$)|\.(pem|key)$/i.test(
        file.path,
      ),
    )
    .map((file) => file.path)
  const sourceMaps = files
    .filter((file) => file.path.endsWith('.map'))
    .map((file) => file.path)
  const dependencies = files
    .filter((file) => /(^|\/)node_modules\//.test(file.path))
    .map((file) => file.path)
  const empty = files.filter((file) => file.size === 0).map((file) => file.path)
  const seen = new Set<string>(),
    duplicates = new Set<string>()
  for (const file of files) {
    if (seen.has(file.path)) duplicates.add(file.path)
    seen.add(file.path)
  }
  return {
    privatePaths,
    sourceMaps,
    dependencies,
    empty,
    duplicates: [...duplicates],
    missingEntry: files.length > 0 && !seen.has('index.html'),
    spa,
  }
}

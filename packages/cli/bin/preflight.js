export function localPreflight(files, { maxBytes = 500 * 1024 * 1024 } = {}) {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
  const errors = [],
    warnings = []
  if (!files.length)
    errors.push({
      code: 'empty_build',
      message: 'No files found after applying .yeeetignore.',
    })
  if (files.length > 5000)
    errors.push({
      code: 'too_many_files',
      message: 'A deployment supports at most 5,000 files.',
    })
  if (totalBytes > maxBytes)
    errors.push({
      code: 'build_too_large',
      message: `The build exceeds the ${maxBytes.toLocaleString()} byte limit.`,
    })
  const privatePaths = files
    .filter((file) =>
      /(^|\/)(\.env(?:\.[^/]*)?|\.git|\.ssh|id_rsa|id_ed25519)(\/|$)|\.(pem|key)$/i.test(
        file.path,
      ),
    )
    .map((file) => file.path)
  if (privatePaths.length)
    errors.push({
      code: 'private_files',
      message:
        'Potential private files are included. Exclude them with .yeeetignore before publishing.',
      paths: privatePaths,
    })
  if (files.length && !files.some((file) => file.path === 'index.html'))
    warnings.push({
      code: 'missing_index',
      message:
        'No index.html at the publish root. Confirm this is intentional.',
    })
  const maps = files
    .filter((file) => file.path.endsWith('.map'))
    .map((file) => file.path)
  if (maps.length)
    warnings.push({
      code: 'source_maps',
      message: 'Source maps may expose original source code.',
      paths: maps,
    })
  const empty = files.filter((file) => file.size === 0).map((file) => file.path)
  if (empty.length)
    warnings.push({
      code: 'empty_files',
      message: 'Some files are empty.',
      paths: empty,
    })
  return {
    fileCount: files.length,
    totalBytes,
    maxBytes,
    errors,
    warnings,
    files: files.map(({ path, size }) => ({ path, size })),
  }
}

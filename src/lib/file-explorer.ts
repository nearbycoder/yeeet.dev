export type ManifestFile = {
  path: string
  size: number
  contentType: string
  checksum: string | null
}
export function fileFamily(type: string) {
  if (type.startsWith('image/')) return 'Images'
  if (type.includes('javascript')) return 'JavaScript'
  if (type.includes('css')) return 'Stylesheets'
  if (type.includes('html')) return 'HTML'
  if (type.startsWith('font/') || type.includes('font')) return 'Fonts'
  return 'Other'
}
export function exploreFiles(
  files: Array<ManifestFile>,
  query: string,
  family: string,
  order: string,
) {
  return files
    .filter(
      (file) =>
        file.path.toLowerCase().includes(query.trim().toLowerCase()) &&
        (!family || fileFamily(file.contentType) === family),
    )
    .sort(
      (a, b) =>
        (order === 'largest'
          ? b.size - a.size
          : order === 'smallest'
            ? a.size - b.size
            : 0) || a.path.localeCompare(b.path),
    )
}

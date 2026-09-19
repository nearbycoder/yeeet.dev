export function fileVersionUrl(base: string, path: string) {
  const url = new URL(base)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error('Invalid version URL.')
  const segments = path.split('/')
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\\'),
    )
  )
    throw new Error('Invalid file path.')
  url.pathname = '/' + segments.map(encodeURIComponent).join('/')
  url.search = ''
  url.hash = ''
  return url.href
}

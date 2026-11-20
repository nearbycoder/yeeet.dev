export function candidatePaths(pathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = pathname
  }
  const normalized = decoded.replaceAll('\\', '/')
  const rawParts = normalized.split('/')
  if (rawParts.includes('..') || normalized.includes('\0')) return []
  const trailingSlash = normalized.endsWith('/')
  const parts = rawParts.filter((part) => part && part !== '.')
  if (!parts.length) return ['index.html']
  const clean = parts.join('/')
  if (trailingSlash) return [`${clean}/index.html`]
  if (!parts.at(-1)?.includes('.')) {
    return [clean, `${clean}.html`, `${clean}/index.html`]
  }
  return [clean]
}

export function shouldUseSpaFallback(
  request: Request,
  enabled: boolean,
  pathname?: string,
) {
  if (!enabled) return false
  const resolvedPath = pathname ?? new URL(request.url).pathname
  const segment = resolvedPath.split('/').at(-1)
  if (segment?.includes('.')) return false
  const accept = request.headers.get('accept')
  if (accept) return accept.includes('text/html')
  return true
}

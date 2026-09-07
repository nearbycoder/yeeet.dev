export function candidatePaths(pathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = pathname
  }
  const clean = decoded.replace(/^\/+/, '').replaceAll('\\', '/')
  if (clean.split('/').includes('..')) return []
  if (!clean || clean.endsWith('/')) return [`${clean}index.html`]
  if (!clean.split('/').at(-1)?.includes('.')) {
    return [clean, `${clean}.html`, `${clean}/index.html`]
  }
  return [clean]
}

export function shouldUseSpaFallback(request: Request, enabled: boolean) {
  if (!enabled) return false
  const segment = new URL(request.url).pathname.split('/').at(-1)
  if (segment?.includes('.')) return false
  const accept = request.headers.get('accept')
  if (accept) return accept.includes('text/html')
  return true
}

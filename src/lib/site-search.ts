type SearchableSite = {
  slug: string
  activeDeploymentId: string | null
  customDomains: Array<{ hostname: string }>
}

export function filterSites<T extends SearchableSite>(
  sites: Array<T>,
  query: string,
  status: 'all' | 'live' | 'inactive',
) {
  const search = query.trim().toLowerCase()
  return sites.filter((site) => {
    if (status === 'live' && !site.activeDeploymentId) return false
    if (status === 'inactive' && site.activeDeploymentId) return false
    return (
      site.slug.includes(search) ||
      site.customDomains.some((domain) => domain.hostname.includes(search))
    )
  })
}

type SearchableSite = {
  organization?: { favorite: boolean; project: string; tags: Array<string> }
  slug: string
  activeDeploymentId: string | null
  customDomains: Array<{ hostname: string }>
}

export function filterSites<T extends SearchableSite>(
  sites: Array<T>,
  query: string,
  status: 'all' | 'live' | 'inactive',
  group = '',
  favoritesOnly = false,
) {
  const search = query.trim().toLowerCase()
  return sites.filter((site) => {
    if (group && site.organization?.project !== group) return false
    if (favoritesOnly && !site.organization?.favorite) return false
    if (status === 'live' && !site.activeDeploymentId) return false
    if (status === 'inactive' && site.activeDeploymentId) return false
    return (
      site.slug.toLowerCase().includes(search) ||
      Boolean(site.organization?.project.toLowerCase().includes(search)) ||
      Boolean(site.organization?.tags.some((tag) => tag.includes(search))) ||
      site.customDomains.some((domain) => domain.hostname.includes(search))
    )
  })
}

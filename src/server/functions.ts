import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import { adminOverview } from './admin'
import { requireActor, requireAdmin } from './actor'
import { listUserCustomDomains } from './custom-domains'
import { listRecentDeployments, listSites } from './deployments'
import { publicPlatformConfig } from './platform-config'

export const getSession = createServerFn({ method: 'GET' }).handler(
  async () => {
    return auth.api.getSession({ headers: getRequestHeaders() })
  },
)

export const getDashboardData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const actor = await requireActor(getRequest())
    const [siteRows, deploymentRows, domainRows] = await Promise.all([
      listSites(actor.userId),
      listRecentDeployments(actor.userId),
      listUserCustomDomains(actor.userId),
    ])
    const domainsBySite = new Map<string, typeof domainRows>()
    for (const domain of domainRows) {
      const current = domainsBySite.get(domain.siteId) ?? []
      current.push(domain)
      domainsBySite.set(domain.siteId, current)
    }
    return {
      platform: publicPlatformConfig(),
      sites: siteRows.map((site) => ({
        ...site,
        customDomains: domainsBySite.get(site.id) ?? [],
      })),
      deployments: deploymentRows,
    }
  },
)

export const getPublicPlatformConfig = createServerFn({
  method: 'GET',
}).handler(() => publicPlatformConfig())

export const getAdminData = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin(getRequest())
    return adminOverview()
  },
)

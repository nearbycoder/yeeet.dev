import { createServerFn } from '@tanstack/react-start'
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import { adminOverview } from './admin'
import { requireActor, requireAdmin } from './actor'
import { getSiteAnalytics } from './analytics'
import { listCustomDomains, listUserCustomDomains } from './custom-domains'
import {
  listRecentDeployments,
  listSites,
  listSiteVersions,
} from './deployments'
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

export const getSiteWorkspaceData = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const [siteRows, domains, history] = await Promise.all([
      listSites(actor.userId),
      listCustomDomains(actor.userId, data.slug),
      listSiteVersions(actor.userId, data.slug),
    ])
    const site = siteRows.find((row) => row.slug === history.site.slug)
    if (!site) throw new Error('Site not found.')
    return {
      platform: publicPlatformConfig(),
      site: { ...site, customDomains: domains },
      latestVersions: history.versions.slice(0, 3),
    }
  })

export const getSiteVersionsData = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    return listSiteVersions(actor.userId, data.slug)
  })

export const getSiteDomainsData = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    return {
      domains: await listCustomDomains(actor.userId, data.slug),
    }
  })

export const getSiteAnalyticsData = createServerFn({ method: 'GET' })
  .validator((data: { slug: string; days?: number }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    return getSiteAnalytics(actor.userId, data.slug, data.days)
  })

export const getPublicPlatformConfig = createServerFn({
  method: 'GET',
}).handler(() => publicPlatformConfig())

export const getAdminData = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdmin(getRequest())
    return adminOverview()
  },
)

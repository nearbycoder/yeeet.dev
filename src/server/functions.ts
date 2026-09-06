import { organizationSchema, emptyOrganization } from '#/lib/site-organization'
import { listSitePreferences, saveSiteOrganization } from './site-organization'
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
    const [siteRows, deploymentRows, domainRows, preferences] =
      await Promise.all([
        listSites(actor.userId),
        listRecentDeployments(actor.userId),
        listUserCustomDomains(actor.userId),
        listSitePreferences(actor.userId),
      ])
    const preferencesBySite = new Map(
      preferences.map((pref) => [pref.siteId, pref]),
    )
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
        organization: preferencesBySite.get(site.id) ?? emptyOrganization,
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
    const [siteRows, domains, history, preferences] = await Promise.all([
      listSites(actor.userId, data.slug),
      listCustomDomains(actor.userId, data.slug),
      listSiteVersions(actor.userId, data.slug, 3),
      listSitePreferences(actor.userId),
    ])
    const site = siteRows.find((row) => row.slug === history.site.slug)
    if (!site) throw new Error('Site not found.')
    return {
      platform: publicPlatformConfig(),
      site: {
        ...site,
        organization:
          preferences.find((pref) => pref.siteId === site.id) ??
          emptyOrganization,
        customDomains: domains,
      },
      latestVersions: history.versions,
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

export const getDeploymentInspection = createServerFn({ method: 'GET' })
  .validator((data: { slug: string; version: string; base?: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { inspectDeployment, compareDeployments } =
      await import('./deployment-inspection')
    return {
      version: await inspectDeployment(actor.userId, data.slug, data.version),
      comparison: data.base
        ? await compareDeployments(
            actor.userId,
            data.slug,
            data.version,
            data.base,
          )
        : null,
    }
  })

export const getSiteChannelsData = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { listSiteChannels } = await import('./deployments')
    const [history, result] = await Promise.all([
      listSiteVersions(actor.userId, data.slug),
      listSiteChannels(actor.userId, data.slug),
    ])
    return { history, channels: result.channels }
  })

export const getAccountConsoleData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const actor = await requireActor(getRequest())
    const { listAccountKeys } = await import('./account-console')
    const { listWebhookEndpoints, listWebhookDeliveries, WEBHOOK_EVENTS } =
      await import('./webhooks')
    const [keys, webhooks, deliveries] = await Promise.all([
      listAccountKeys(actor.userId),
      listWebhookEndpoints(actor.userId),
      listWebhookDeliveries(actor.userId),
    ])
    return {
      keys,
      webhooks,
      deliveries,
      events: WEBHOOK_EVENTS,
      platform: publicPlatformConfig(),
    }
  },
)

export const updateSiteOrganization = createServerFn({ method: 'POST' })
  .validator((data: unknown) => organizationSchema.parse(data))
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    return saveSiteOrganization(actor.userId, data)
  })

export const getWorkspaceConsole = createServerFn({ method: 'GET' })
  .validator(
    (data: { workspace?: string; site?: string; version?: string }) => data,
  )
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { workspaceConsole } = await import('./workspaces')
    return {
      ...(await workspaceConsole(actor.userId, data)),
      platform: publicPlatformConfig(),
      userId: actor.userId,
    }
  })
export const updateWorkspace = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { mutateWorkspace } = await import('./workspaces')
    return mutateWorkspace(actor.userId, data)
  })

export const getLifecycleConsole = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { lifecycleConsole } = await import('./lifecycle')
    return lifecycleConsole(actor.userId, data.slug)
  })
export const updatePreviewExpiry = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { setPreviewExpiry } = await import('./lifecycle')
    return setPreviewExpiry(actor.userId, data)
  })
export const updateHealthCheck = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { saveHealthCheck } = await import('./lifecycle')
    return saveHealthCheck(actor.userId, data)
  })
export const checkSiteHealth = createServerFn({ method: 'POST' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { runHealthCheck } = await import('./lifecycle')
    return runHealthCheck(actor.userId, data.slug)
  })

export const getRetentionConsole = createServerFn({ method: 'GET' })
  .validator((data: { slug: string }) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { retentionConsole } = await import('./retention')
    return retentionConsole(actor.userId, data.slug)
  })
export const getRetentionPreview = createServerFn({ method: 'GET' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { previewRetention } = await import('./retention')
    return previewRetention(actor.userId, data)
  })
export const updateRetention = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { saveRetention } = await import('./retention')
    return saveRetention(actor.userId, data)
  })
export const cleanRetainedVersions = createServerFn({ method: 'POST' })
  .validator((data: unknown) => data)
  .handler(async ({ data }) => {
    const actor = await requireActor(getRequest())
    const { executeRetention } = await import('./retention')
    return executeRetention(actor.userId, data)
  })

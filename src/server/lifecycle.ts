import { and, eq, lte } from 'drizzle-orm'
import { db } from '#/db'
import { deployments, siteHealth, sites } from '#/db/schema'
import { expirySchema, healthSchema } from '#/lib/lifecycle'
import { HttpError } from './http'
import { listSiteVersions, normalizeSlug, versionUrl } from './deployments'
import { maybeServeSite } from './site-gateway'
import {
  deploymentShareCookieName,
  shareTokenForDeployment,
} from './deployment-access'

export async function ownedLifecycleSite(userId: string, slug: string) {
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.userId, userId), eq(sites.slug, normalizeSlug(slug))),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  return site
}
export async function lifecycleConsole(userId: string, slug: string) {
  const site = await ownedLifecycleSite(userId, slug)
  const [history, health] = await Promise.all([
    listSiteVersions(userId, slug),
    db.query.siteHealth.findFirst({ where: eq(siteHealth.siteId, site.id) }),
  ])
  return {
    history,
    health: health
      ? {
          ...health,
          nextCheckAt: health.nextCheckAt.toISOString(),
          checkedAt: health.checkedAt?.toISOString() ?? null,
        }
      : null,
  }
}
export async function setPreviewExpiry(userId: string, input: unknown) {
  const data = expirySchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  if (data.version === site.activeDeploymentId)
    throw new HttpError(
      409,
      'Production cannot expire. Choose a preview version.',
      'production_protected',
    )
  const expiresAt = data.hours
    ? new Date(Date.now() + data.hours * 3600000)
    : null
  const rows = await db
    .update(deployments)
    .set({ expiresAt })
    .where(
      and(
        eq(deployments.id, data.version),
        eq(deployments.siteId, site.id),
        eq(deployments.status, 'ready'),
      ),
    )
    .returning({ id: deployments.id })
  if (!rows.length)
    throw new HttpError(404, 'Ready preview version not found.', 'not_found')
  return { expiresAt: expiresAt?.toISOString() ?? null }
}
export async function saveHealthCheck(userId: string, input: unknown) {
  const data = healthSchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  const values = {
    enabled: data.enabled,
    path: data.path,
    expectedStatus: data.expectedStatus,
    nextCheckAt: new Date(),
    checkedAt: null,
    responseStatus: null,
    error: null,
    latencyMs: null,
    deploymentId: null,
  }
  await db
    .insert(siteHealth)
    .values({ siteId: site.id, userId, ...values })
    .onConflictDoUpdate({ target: siteHealth.siteId, set: values })
  return { saved: true }
}
async function checkOrigin(config: typeof siteHealth.$inferSelect) {
  const site = await db.query.sites.findFirst({
    where: eq(sites.id, config.siteId),
  })
  const deployment = site?.activeDeploymentId
    ? await db.query.deployments.findFirst({
        where: and(
          eq(deployments.id, site.activeDeploymentId),
          eq(deployments.siteId, site.id),
          eq(deployments.status, 'ready'),
        ),
      })
    : null
  const started = Date.now()
  let responseStatus = 0
  let error: string | null = null
  try {
    if (!deployment) throw new Error('No ready production version.')
    const url = new URL(versionUrl(deployment.id))
    url.pathname = config.path
    const headers = new Headers()
    if (deployment.passwordHash)
      headers.set(
        'cookie',
        `${deploymentShareCookieName(deployment.id)}=${shareTokenForDeployment(deployment.id, deployment.shareNonce)}`,
      )
    const response = await maybeServeSite(new Request(url, { headers }))
    responseStatus = response?.status ?? 0
    await response?.body?.cancel()
    if (responseStatus !== config.expectedStatus)
      error = `Expected HTTP ${config.expectedStatus}, received ${responseStatus}.`
  } catch (failure) {
    error = failure instanceof Error ? failure.message : 'Origin check failed.'
  }
  await db
    .update(siteHealth)
    .set({
      checkedAt: new Date(),
      deploymentId: deployment?.id ?? null,
      responseStatus,
      latencyMs: Date.now() - started,
      error,
    })
    .where(
      and(
        eq(siteHealth.siteId, config.siteId),
        eq(siteHealth.path, config.path),
        eq(siteHealth.expectedStatus, config.expectedStatus),
      ),
    )
  return { responseStatus, error }
}
export async function runHealthCheck(userId: string, slug: string) {
  const site = await ownedLifecycleSite(userId, slug)
  const config = await db.query.siteHealth.findFirst({
    where: eq(siteHealth.siteId, site.id),
  })
  if (!config)
    throw new HttpError(
      409,
      'Save health check settings first.',
      'not_configured',
    )
  return checkOrigin(config)
}
export async function processHealthChecks() {
  const now = new Date()
  const due = await db
    .select()
    .from(siteHealth)
    .where(and(eq(siteHealth.enabled, true), lte(siteHealth.nextCheckAt, now)))
    .limit(10)
  for (const config of due) {
    const claim = await db
      .update(siteHealth)
      .set({ nextCheckAt: new Date(Date.now() + 15 * 60000) })
      .where(
        and(
          eq(siteHealth.siteId, config.siteId),
          eq(siteHealth.enabled, true),
          lte(siteHealth.nextCheckAt, now),
        ),
      )
      .returning({ id: siteHealth.siteId })
    if (claim.length) await checkOrigin(config)
  }
}
let healthWorkerStarted = false
export function startHealthWorker() {
  if (healthWorkerStarted || process.env.NODE_ENV === 'test') return
  healthWorkerStarted = true
  const run = () =>
    void processHealthChecks().catch((error) =>
      console.error('Health check worker failed', error),
    )
  run()
  const timer = setInterval(run, 60000)
  timer.unref()
}

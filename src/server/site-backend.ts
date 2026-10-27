import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { deployments, sites } from '#/db/schema'
import {
  backendRuntimeEnabled,
  backendRuntimeOperation,
  backendSummary,
  parseBackend,
} from './backend-runtime'
import { HttpError } from './http'

const DATABASE =
  /^(?:live|channel-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|version-[0-9a-f-]{36})$/

type RuntimeStatus = {
  databases: Array<{
    name: string
    sizeBytes: number
    migrations: Array<{
      name: string
      checksum: string
      deploymentId: string | null
      appliedAt: string
    }>
    backups: Array<{ name: string; sizeBytes: number }>
    worker: {
      deploymentId: string
      startedAt: string
      lastUsedAt: string
      inflight: number
    } | null
  }>
}

async function ownedSite(userId: string, slug: string) {
  const site = await db.query.sites.findFirst({
    where: and(
      eq(sites.slug, slug.trim().toLowerCase()),
      eq(sites.userId, userId),
    ),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  return site
}

function databaseName(value: unknown) {
  const database = typeof value === 'string' && value ? value : 'live'
  if (!DATABASE.test(database))
    throw new HttpError(
      400,
      'Use live, channel-<name>, or version-<deployment-id> as the database.',
      'invalid_database',
    )
  return database
}

export async function getSiteBackend(userId: string, slug: string) {
  const site = await ownedSite(userId, slug)
  const active = site.activeDeploymentId
    ? await db.query.deployments.findFirst({
        where: eq(deployments.id, site.activeDeploymentId),
        columns: { id: true, backend: true },
      })
    : undefined
  const backend = parseBackend(active?.backend)
  const runtimeEnabled = backendRuntimeEnabled()
  const status = runtimeEnabled
    ? await backendRuntimeOperation<RuntimeStatus>('status', {
        siteId: site.id,
      })
    : { databases: [] }
  return {
    site: site.slug,
    runtimeEnabled,
    activeDeploymentId: site.activeDeploymentId,
    backend: backendSummary(backend),
    databases: status.databases,
  }
}

export async function getSiteBackendLogs(
  userId: string,
  slug: string,
  database?: string | null,
) {
  const site = await ownedSite(userId, slug)
  const result = await backendRuntimeOperation<{
    entries: Array<{
      database: string
      at: string
      stream: 'stdout' | 'stderr'
      line: string
    }>
  }>('logs', {
    siteId: site.id,
    ...(database ? { database: databaseName(database) } : {}),
  })
  return { site: site.slug, entries: result.entries }
}

export async function restoreSiteBackend(
  userId: string,
  slug: string,
  input: { database?: unknown; backup?: unknown },
) {
  const site = await ownedSite(userId, slug)
  if (typeof input.backup !== 'string' || !input.backup)
    throw new HttpError(400, 'Choose a backup to restore.', 'invalid_backup')
  const result = await backendRuntimeOperation<{
    restored: string
    database: string
    safetyBackup: string | null
  }>('restore', {
    siteId: site.id,
    database: databaseName(input.database),
    backup: input.backup,
  })
  return { site: site.slug, ...result }
}

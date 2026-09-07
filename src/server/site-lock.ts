import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { deployments, sites } from '#/db/schema'
import { HttpError } from './http'

export type SiteTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

// All eligibility-changing writers lock the parent site before any child row.
// Re-read targets after acquiring the lock; callers' earlier reads may be stale.
// Keep storage requests and webhook delivery outside this transaction.
export async function lockSite(
  tx: SiteTransaction,
  siteId: string,
  userId: string,
) {
  const rows = await tx
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .for('update')
  const site = rows.at(0)
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  return site
}
export async function withSiteLock<T>(
  siteId: string,
  userId: string,
  work: (tx: SiteTransaction, site: typeof sites.$inferSelect) => Promise<T>,
) {
  return db.transaction(async (tx) =>
    work(tx, await lockSite(tx, siteId, userId)),
  )
}
export async function lockedVersion(
  tx: SiteTransaction,
  siteId: string,
  versionId: string,
  ready = false,
) {
  const version = await tx.query.deployments.findFirst({
    where: and(eq(deployments.id, versionId), eq(deployments.siteId, siteId)),
  })
  if (!version) throw new HttpError(404, 'Version not found.', 'not_found')
  if (ready && version.status !== 'ready')
    throw new HttpError(409, 'This version is not ready.', 'version_not_ready')
  return version
}

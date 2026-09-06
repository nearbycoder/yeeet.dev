import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  deploymentFeedback,
  deployments,
  siteChannels,
  siteRetention,
  sites,
  storageCleanupJobs,
} from '#/db/schema'
import {
  retentionCandidates,
  retentionExecuteSchema,
  retentionSaveSchema,
  retentionSchema,
} from '#/lib/retention'
import { ownedLifecycleSite } from './lifecycle'
import { HttpError } from './http'
import { deleteStoredPrefix } from './storage'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function plan(
  tx: typeof db | Transaction,
  siteId: string,
  policy: { keepCount: number; minAgeDays: number },
) {
  const site = await tx.query.sites.findFirst({ where: eq(sites.id, siteId) })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  const versions = await tx
    .select({
      id: deployments.id,
      status: deployments.status,
      createdAt: deployments.createdAt,
      totalBytes: deployments.totalBytes,
    })
    .from(deployments)
    .where(eq(deployments.siteId, siteId))
    .orderBy(desc(deployments.createdAt), deployments.id)
    .limit(2000)
  const channels = await tx
    .select({ id: siteChannels.deploymentId })
    .from(siteChannels)
    .where(eq(siteChannels.siteId, siteId))
  const feedback = await tx
    .selectDistinct({ id: deploymentFeedback.deploymentId })
    .from(deploymentFeedback)
    .innerJoin(deployments, eq(deployments.id, deploymentFeedback.deploymentId))
    .where(
      and(
        eq(deployments.siteId, siteId),
        eq(deploymentFeedback.resolved, false),
      ),
    )
  const protectedIds = new Set(
    [
      site.activeDeploymentId,
      ...channels.map((row) => row.id),
      ...feedback.map((row) => row.id),
    ].filter((id): id is string => Boolean(id)),
  )
  const candidates = retentionCandidates(
    versions,
    protectedIds,
    policy.keepCount,
    policy.minAgeDays,
  )
  return {
    candidates: candidates.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString(),
    })),
    totalBytes: candidates.reduce(
      (sum, version) => sum + version.totalBytes,
      0,
    ),
    examined: versions.length,
    protectedCount: protectedIds.size,
  }
}
export async function previewRetention(userId: string, input: unknown) {
  const data = retentionSchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  return plan(db, site.id, data)
}
export async function retentionConsole(userId: string, slug: string) {
  const site = await ownedLifecycleSite(userId, slug)
  const [policy, pending] = await Promise.all([
    db.query.siteRetention.findFirst({
      where: eq(siteRetention.siteId, site.id),
    }),
    db
      .select({
        id: storageCleanupJobs.id,
        attempts: storageCleanupJobs.attempts,
        error: storageCleanupJobs.error,
      })
      .from(storageCleanupJobs)
      .where(
        and(
          eq(storageCleanupJobs.siteId, site.id),
          eq(storageCleanupJobs.userId, userId),
        ),
      )
      .limit(100),
  ])
  return {
    policy: policy
      ? {
          ...policy,
          nextRunAt: policy.nextRunAt.toISOString(),
          lastRunAt: policy.lastRunAt?.toISOString() ?? null,
        }
      : null,
    pending,
  }
}
export async function saveRetention(userId: string, input: unknown) {
  const data = retentionSaveSchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  const values = {
    enabled: data.enabled,
    keepCount: data.keepCount,
    minAgeDays: data.minAgeDays,
    nextRunAt: new Date(Date.now() + 86400000),
    error: null,
  }
  await db
    .insert(siteRetention)
    .values({ siteId: site.id, userId, ...values })
    .onConflictDoUpdate({ target: siteRetention.siteId, set: values })
  return { saved: true }
}
async function retireVersions(
  userId: string,
  siteId: string,
  policy: { keepCount: number; minAgeDays: number },
  expectedIds?: Array<string>,
  automatic = false,
) {
  return db.transaction(async (tx) => {
    // A short metadata-only transaction serializes pointer/feedback writes with
    // eligibility and deletion. Storage work runs from a durable queue afterward.
    await tx.execute(
      sql`lock table sites, site_channels, deployments, deployment_feedback, site_retention in share row exclusive mode`,
    )
    const current = await tx.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, userId)),
    })
    if (!current) throw new HttpError(404, 'Site not found.', 'not_found')
    if (automatic) {
      const saved = await tx.query.siteRetention.findFirst({
        where: eq(siteRetention.siteId, siteId),
      })
      if (
        !saved?.enabled ||
        saved.keepCount !== policy.keepCount ||
        saved.minAgeDays !== policy.minAgeDays
      )
        return { deletedCount: 0 }
    }
    const preview = await plan(tx, siteId, policy)
    const ids = preview.candidates.map((version) => version.id)
    if (
      expectedIds &&
      JSON.stringify([...ids].sort()) !==
        JSON.stringify([...expectedIds].sort())
    )
      throw new HttpError(
        409,
        'The cleanup plan changed. Preview it again before deleting.',
        'stale_cleanup_plan',
      )
    if (ids.length) {
      await tx
        .insert(storageCleanupJobs)
        .values(
          ids.map((id) => ({
            id,
            userId,
            siteId,
            prefix: `sites/${siteId}/deployments/${id}/`,
          })),
        )
        .onConflictDoNothing()
      await tx
        .delete(deployments)
        .where(
          and(eq(deployments.siteId, siteId), inArray(deployments.id, ids)),
        )
    }
    return { deletedCount: ids.length }
  })
}
export async function executeRetention(userId: string, input: unknown) {
  const data = retentionExecuteSchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  return retireVersions(userId, site.id, data, data.expectedIds)
}
export async function processStorageCleanup() {
  const now = new Date()
  const due = await db
    .select()
    .from(storageCleanupJobs)
    .where(lte(storageCleanupJobs.nextAttemptAt, now))
    .limit(10)
  for (const job of due) {
    const claimed = await db
      .update(storageCleanupJobs)
      .set({
        nextAttemptAt: new Date(Date.now() + 10 * 60000),
        attempts: job.attempts + 1,
      })
      .where(
        and(
          eq(storageCleanupJobs.id, job.id),
          lte(storageCleanupJobs.nextAttemptAt, now),
        ),
      )
      .returning({ id: storageCleanupJobs.id })
    if (!claimed.length) continue
    try {
      await deleteStoredPrefix(job.prefix)
      await db
        .delete(storageCleanupJobs)
        .where(eq(storageCleanupJobs.id, job.id))
    } catch (error) {
      await db
        .update(storageCleanupJobs)
        .set({
          error:
            error instanceof Error ? error.message : 'Storage cleanup failed.',
          nextAttemptAt: new Date(
            Date.now() +
              Math.min(86400000, 60000 * 2 ** Math.min(job.attempts, 10)),
          ),
        })
        .where(eq(storageCleanupJobs.id, job.id))
    }
  }
}
export async function processRetention() {
  const now = new Date()
  const due = await db
    .select()
    .from(siteRetention)
    .where(
      and(eq(siteRetention.enabled, true), lte(siteRetention.nextRunAt, now)),
    )
    .limit(10)
  for (const policy of due) {
    const claimed = await db
      .update(siteRetention)
      .set({ nextRunAt: new Date(Date.now() + 86400000) })
      .where(
        and(
          eq(siteRetention.siteId, policy.siteId),
          eq(siteRetention.enabled, true),
          lte(siteRetention.nextRunAt, now),
        ),
      )
      .returning({ id: siteRetention.siteId })
    if (!claimed.length) continue
    try {
      const result = await retireVersions(
        policy.userId,
        policy.siteId,
        policy,
        undefined,
        true,
      )
      await db
        .update(siteRetention)
        .set({
          lastRunAt: new Date(),
          lastDeletedCount: result.deletedCount,
          error: null,
        })
        .where(eq(siteRetention.siteId, policy.siteId))
    } catch (error) {
      await db
        .update(siteRetention)
        .set({
          lastRunAt: new Date(),
          error: error instanceof Error ? error.message : 'Retention failed.',
        })
        .where(eq(siteRetention.siteId, policy.siteId))
    }
  }
}
let started = false
export function startRetentionWorker() {
  if (started || process.env.NODE_ENV === 'test') return
  started = true
  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await processRetention()
      await processStorageCleanup()
    } catch (error) {
      console.error('Retention worker failed', error)
    } finally {
      running = false
    }
  }
  void run()
  const timer = setInterval(() => void run(), 60000)
  timer.unref()
}

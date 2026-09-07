import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { deployments } from '#/db/schema'
import { findSiteVersion } from './deployments'
import { lockedVersion, withSiteLock } from './site-lock'

export const retentionPinSchema = z.object({
  slug: z.string().min(1).max(63),
  version: z.string().min(8).max(36),
  pinned: z.boolean(),
})
export async function setRetentionPin(userId: string, input: unknown) {
  const data = retentionPinSchema.parse(input)
  const { history, version } = await findSiteVersion(
    userId,
    data.slug,
    data.version,
  )
  return withSiteLock(history.site.id, userId, async (tx) => {
    await lockedVersion(tx, history.site.id, version.id)
    await tx
      .update(deployments)
      .set({ retentionPinned: data.pinned })
      .where(eq(deployments.id, version.id))
    return { pinned: data.pinned }
  })
}

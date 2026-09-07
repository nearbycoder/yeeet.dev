import { eq } from 'drizzle-orm'
import { deployments } from '#/db/schema'
import { versionNotesSchema } from '#/lib/version-notes'
import { findSiteVersion } from './deployments'
import { lockedVersion, withSiteLock } from './site-lock'
import { HttpError } from './http'

export async function saveVersionNotes(userId: string, input: unknown) {
  const data = versionNotesSchema.parse(input)
  const { history, version } = await findSiteVersion(
    userId,
    data.slug,
    data.version,
  )
  return withSiteLock(history.site.id, userId, async (tx) => {
    const fresh = await lockedVersion(tx, history.site.id, version.id)
    if (
      fresh.releaseLabel !== data.expectedLabel ||
      fresh.releaseNotes !== data.expectedNotes
    )
      throw new HttpError(
        409,
        'Release notes changed elsewhere. Reload before editing again.',
        'notes_conflict',
      )
    await tx
      .update(deployments)
      .set({ releaseLabel: data.label, releaseNotes: data.notes })
      .where(eq(deployments.id, version.id))
    return { label: data.label, notes: data.notes }
  })
}

import { eq } from 'drizzle-orm'
import { sites } from '#/db/schema'
import { siteNotesSchema } from '#/lib/site-notes'
import { ownedLifecycleSite } from './lifecycle'
import { withSiteLock } from './site-lock'
import { HttpError } from './http'

export async function saveSiteNotes(userId: string, input: unknown) {
  const data = siteNotesSchema.parse(input)
  const site = await ownedLifecycleSite(userId, data.slug)
  return withSiteLock(site.id, userId, async (tx, fresh) => {
    if (fresh.notes !== data.expectedNotes)
      throw new HttpError(
        409,
        'Notes changed elsewhere. Reload this page before editing again.',
        'notes_conflict',
      )
    await tx
      .update(sites)
      .set({ notes: data.notes })
      .where(eq(sites.id, site.id))
    return { notes: data.notes }
  })
}

import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { sitePreferences, sites } from '#/db/schema'
import { organizationSchema } from '#/lib/site-organization'
import { HttpError } from './http'

export async function listSitePreferences(userId: string) {
  const rows = await db
    .select()
    .from(sitePreferences)
    .where(eq(sitePreferences.userId, userId))
  return rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags) as Array<string>,
  }))
}
export async function saveSiteOrganization(userId: string, input: unknown) {
  const data = organizationSchema.parse(input)
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.slug, data.slug), eq(sites.userId, userId)),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  const values = {
    favorite: data.favorite,
    project: data.project,
    tags: JSON.stringify(data.tags),
  }
  await db
    .insert(sitePreferences)
    .values({ id: randomUUID(), userId, siteId: site.id, ...values })
    .onConflictDoUpdate({
      target: [sitePreferences.userId, sitePreferences.siteId],
      set: values,
    })
  return { saved: true }
}

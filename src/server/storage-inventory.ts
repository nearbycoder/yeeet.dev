import { and, asc, count, desc, eq, ilike, sql } from 'drizzle-orm'
import { db } from '#/db'
import { sites, deployments } from '#/db/schema'
import { storageSearchSchema } from '#/lib/storage-inventory'
import { searchPattern } from './pagination'

export async function storageInventory(userId: string, input: unknown = {}) {
  const data = storageSearchSchema.parse(input)
  const bytes = sql<number>`coalesce(sum(${deployments.totalBytes}),0)::double precision`,
    versions = count(deployments.id)
  const where = and(
    eq(sites.userId, userId),
    data.q ? ilike(sites.slug, searchPattern(data.q)) : undefined,
  )
  const [rows, filtered, totals] = await Promise.all([
    db
      .select({ id: sites.id, slug: sites.slug, bytes, versions })
      .from(sites)
      .leftJoin(deployments, eq(deployments.siteId, sites.id))
      .where(where)
      .groupBy(sites.id)
      .orderBy(
        data.sort === 'name'
          ? asc(sites.slug)
          : data.sort === 'versions'
            ? desc(versions)
            : desc(bytes),
        asc(sites.id),
      )
      .limit(25)
      .offset(data.page * 25),
    db.select({ sites: count() }).from(sites).where(where),
    db
      .select({ bytes, versions })
      .from(sites)
      .leftJoin(deployments, eq(deployments.siteId, sites.id))
      .where(eq(sites.userId, userId)),
  ])
  return {
    rows,
    totalSites: filtered[0].sites,
    totalBytes: totals[0].bytes,
    totalVersions: totals[0].versions,
    page: data.page,
    hasMore: (data.page + 1) * 25 < filtered[0].sites,
  }
}

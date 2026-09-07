import {
  and,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from 'drizzle-orm'
import { db } from '#/db'
import { customDomains, deployments, sitePreferences, sites } from '#/db/schema'
import { siteSearchSchema } from '#/lib/pagination'
import { emptyOrganization } from '#/lib/site-organization'
import {
  afterCursor,
  cursorTime,
  decodeCursor,
  encodeCursor,
  searchPattern,
} from './pagination'
import { siteUrl } from './platform-config'

export async function searchSites(userId: string, input: unknown = {}) {
  const data = siteSearchSchema.parse(input)
  const q = data.q?.trim().toLowerCase() ?? ''
  const scope = [
    'sites',
    userId,
    q,
    data.status ?? 'all',
    data.group ?? '',
    data.favorites ?? false,
  ]
  const cursor = decodeCursor(data.cursor, scope)
  const conditions = and(
    eq(sites.userId, userId),
    data.status === 'live'
      ? isNotNull(sites.activeDeploymentId)
      : data.status === 'inactive'
        ? isNull(sites.activeDeploymentId)
        : undefined,
    data.group ? eq(sitePreferences.project, data.group) : undefined,
    data.favorites ? eq(sitePreferences.favorite, true) : undefined,
    q
      ? or(
          ilike(sites.slug, searchPattern(q)),
          ilike(sitePreferences.project, searchPattern(q)),
          ilike(sitePreferences.tags, searchPattern(q)),
          exists(
            db
              .select({ id: customDomains.id })
              .from(customDomains)
              .where(
                and(
                  eq(customDomains.siteId, sites.id),
                  eq(customDomains.userId, userId),
                  ilike(customDomains.hostname, searchPattern(q)),
                ),
              ),
          ),
        )
      : undefined,
  )
  const prefJoin = and(
    eq(sitePreferences.siteId, sites.id),
    eq(sitePreferences.userId, userId),
  )
  const [rows, counts, totals, groups] = await Promise.all([
    db
      .select({
        id: sites.id,
        slug: sites.slug,
        activeDeploymentId: sites.activeDeploymentId,
        updatedAt: sites.updatedAt,
        cursorTime: cursorTime(sites.createdAt),
        fileCount: deployments.fileCount,
        totalBytes: deployments.totalBytes,
        source: deployments.source,
        spaFallback: deployments.spaFallback,
        passwordHash: deployments.passwordHash,
        favorite: sitePreferences.favorite,
        project: sitePreferences.project,
        tags: sitePreferences.tags,
      })
      .from(sites)
      .leftJoin(deployments, eq(sites.activeDeploymentId, deployments.id))
      .leftJoin(sitePreferences, prefJoin)
      .where(and(conditions, afterCursor(sites.createdAt, sites.id, cursor)))
      .orderBy(desc(sites.createdAt), desc(sites.id))
      .limit(21),
    db
      .select({ value: count() })
      .from(sites)
      .leftJoin(sitePreferences, prefJoin)
      .where(conditions),
    db.select({ value: count() }).from(sites).where(eq(sites.userId, userId)),
    db
      .selectDistinct({ project: sitePreferences.project })
      .from(sitePreferences)
      .where(eq(sitePreferences.userId, userId))
      .orderBy(sitePreferences.project),
  ])
  const page = rows.slice(0, 20)
  const domains = page.length
    ? await db
        .select({
          id: customDomains.id,
          siteId: customDomains.siteId,
          hostname: customDomains.hostname,
        })
        .from(customDomains)
        .where(
          and(
            eq(customDomains.userId, userId),
            inArray(
              customDomains.siteId,
              page.map((site) => site.id),
            ),
          ),
        )
    : []
  const bySite = new Map<string, typeof domains>()
  for (const domain of domains) {
    const list = bySite.get(domain.siteId) ?? []
    list.push(domain)
    bySite.set(domain.siteId, list)
  }
  return {
    sites: page.map(
      ({
        passwordHash,
        cursorTime: _cursorTime,
        favorite,
        project,
        tags,
        ...site
      }) => ({
        ...site,
        updatedAt: site.updatedAt.toISOString(),
        protected: Boolean(passwordHash),
        url: siteUrl(site.slug),
        organization: {
          ...emptyOrganization,
          favorite: favorite ?? false,
          project: project ?? '',
          tags: tags ? (JSON.parse(tags) as Array<string>) : [],
        },
        customDomains: bySite.get(site.id) ?? [],
      }),
    ),
    nextCursor:
      rows.length > 20 ? encodeCursor(page[page.length - 1], scope) : null,
    matchedCount: counts[0].value,
    totalCount: totals[0].value,
    projectGroups: groups.map((group) => group.project).filter(Boolean),
  }
}

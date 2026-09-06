import { and, asc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { deploymentFiles, deployments, sites } from '#/db/schema'
import { diffManifests, normalizeSlug } from './deployments'
import { HttpError } from './http'

export async function inspectDeployment(
  userId: string,
  slug: string,
  id: string,
) {
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.userId, userId), eq(sites.slug, normalizeSlug(slug))),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  const version = await db.query.deployments.findFirst({
    where: and(eq(deployments.id, id), eq(deployments.siteId, site.id)),
    columns: {
      id: true,
      status: true,
      source: true,
      error: true,
      createdAt: true,
      completedAt: true,
      fileCount: true,
      totalBytes: true,
      channel: true,
      spaFallback: true,
      headerRules: true,
      redirectRules: true,
    },
    with: {
      files: {
        columns: { path: true, size: true, contentType: true, checksum: true },
        orderBy: [asc(deploymentFiles.path)],
      },
    },
  })
  if (!version)
    throw new HttpError(404, 'Version not found in this site.', 'not_found')
  return {
    ...version,
    current: site.activeDeploymentId === id,
    createdAt: version.createdAt.toISOString(),
    completedAt: version.completedAt?.toISOString() ?? null,
  }
}

export async function compareDeployments(
  userId: string,
  slug: string,
  target: string,
  base?: string,
) {
  const [next, previous] = await Promise.all([
    inspectDeployment(userId, slug, target),
    base ? inspectDeployment(userId, slug, base) : Promise.resolve(null),
  ])
  return {
    ...diffManifests(next.files, previous?.files ?? []),
    target: next.id,
    base: previous?.id ?? null,
    routingChanged: Boolean(
      previous && next.spaFallback !== previous.spaFallback,
    ),
    headersChanged: Boolean(
      previous && next.headerRules !== previous.headerRules,
    ),
    redirectsChanged: Boolean(
      previous && next.redirectRules !== previous.redirectRules,
    ),
  }
}

import { and, count, eq, inArray, sql, or, isNull, gt } from 'drizzle-orm'
import { db } from '#/db'
import {
  customDomains,
  deploymentFiles,
  deployments,
  siteHealth,
} from '#/db/schema'
import { currentHealthPassed } from '#/lib/launch-checklist'
import { candidatePaths } from '#/lib/route-resolution'
import { ownedLifecycleSite } from './lifecycle'
import { deserializeSiteRules, matchingRedirect } from './site-rules'
import type { SiteRedirectRule } from './site-rules'
import { simulateRoute } from './route-simulator'

export async function launchChecklist(userId: string, slug: string) {
  const site = await ownedLifecycleSite(userId, slug)
  const [version, counts, domains, health] = await Promise.all([
    site.activeDeploymentId
      ? db.query.deployments.findFirst({
          where: and(
            eq(deployments.id, site.activeDeploymentId),
            eq(deployments.siteId, site.id),
          ),
          columns: {
            id: true,
            status: true,
            passwordHash: true,
            spaFallback: true,
            headerRules: true,
            redirectRules: true,
          },
        })
      : Promise.resolve(undefined),
    db
      .select({
        ready: count(),
        pinned: sql<number>`count(*) filter (where ${deployments.retentionPinned})::integer`,
      })
      .from(deployments)
      .where(
        and(
          eq(deployments.siteId, site.id),
          eq(deployments.status, 'ready'),
          or(
            isNull(deployments.expiresAt),
            gt(deployments.expiresAt, new Date()),
            site.activeDeploymentId
              ? eq(deployments.id, site.activeDeploymentId)
              : undefined,
          ),
        ),
      ),
    db
      .select({ value: count() })
      .from(customDomains)
      .where(
        and(
          eq(customDomains.siteId, site.id),
          eq(customDomains.certificateStatus, 'ISSUED'),
        ),
      ),
    db.query.siteHealth.findFirst({ where: eq(siteHealth.siteId, site.id) }),
  ])
  let rootStatus = 404
  if (version) {
    const rule = matchingRedirect(
      deserializeSiteRules<SiteRedirectRule>(version.redirectRules, []),
      '/',
    )
    const path =
      rule?.status === 200
        ? new URL(rule.to, 'https://rewrite.yeeet.invalid').pathname
        : '/'
    const files = await db
      .select({ path: deploymentFiles.path })
      .from(deploymentFiles)
      .where(
        and(
          eq(deploymentFiles.deploymentId, version.id),
          inArray(deploymentFiles.path, [
            ...candidatePaths(path),
            'index.html',
            '404.html',
          ]),
        ),
      )
    rootStatus = simulateRoute({ ...version, files }, '/').status
  }
  return {
    activeId: version?.id ?? null,
    ready: version?.status === 'ready',
    rootReady: rootStatus >= 200 && rootStatus < 400,
    rootStatus,
    protected: Boolean(version?.passwordHash),
    spa: version?.spaFallback ?? false,
    readyVersions: counts[0].ready,
    pinnedVersions: counts[0].pinned,
    issuedDomains: domains[0].value,
    healthPassed: currentHealthPassed(health ?? null, version?.id ?? null),
    healthCheckedAt: health?.checkedAt?.toISOString() ?? null,
  }
}

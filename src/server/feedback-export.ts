import { z } from 'zod'
import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { db } from '#/db'
import { deploymentFeedback, user, workspaceSites } from '#/db/schema'
import { requireWorkspace } from './workspaces'
import { findSiteVersion } from './deployments'
import { searchPattern } from './pagination'
import { HttpError } from './http'

export const feedbackExportSchema = z.object({
  workspace: z.string().min(1).max(100),
  slug: z.string().min(1).max(63),
  version: z.string().min(8).max(36),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['all', 'open', 'resolved']).default('all'),
})
export async function exportFeedback(userId: string, input: unknown) {
  const data = feedbackExportSchema.parse(input),
    workspace = await requireWorkspace(userId, data.workspace)
  const { history, version } = await findSiteVersion(
    workspace.ownerId,
    data.slug,
    data.version,
  )
  const assigned = await db.query.workspaceSites.findFirst({
    where: and(
      eq(workspaceSites.workspaceId, workspace.id),
      eq(workspaceSites.siteId, history.site.id),
    ),
  })
  if (!assigned)
    throw new HttpError(404, 'Site not found in this workspace.', 'not_found')
  const rows = await db
    .select({
      id: deploymentFeedback.id,
      author: user.name,
      body: deploymentFeedback.body,
      path: deploymentFeedback.path,
      resolved: deploymentFeedback.resolved,
      createdAt: deploymentFeedback.createdAt,
      editedAt: deploymentFeedback.editedAt,
    })
    .from(deploymentFeedback)
    .leftJoin(user, eq(user.id, deploymentFeedback.authorId))
    .where(
      and(
        eq(deploymentFeedback.workspaceId, workspace.id),
        eq(deploymentFeedback.deploymentId, version.id),
        data.status !== 'all'
          ? eq(deploymentFeedback.resolved, data.status === 'resolved')
          : undefined,
        data.q
          ? or(
              ilike(deploymentFeedback.body, searchPattern(data.q)),
              ilike(deploymentFeedback.path, searchPattern(data.q)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(deploymentFeedback.createdAt), desc(deploymentFeedback.id))
    .limit(1001)
  return {
    site: history.site.slug,
    version: version.id,
    truncated: rows.length > 1000,
    comments: rows.slice(0, 1000).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
    })),
  }
}

import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { deploymentFeedback, deployments, workspaceSites } from '#/db/schema'
import { requireWorkspace } from './workspaces'
import { withSiteLock } from './site-lock'
import { HttpError } from './http'

export const feedbackEditSchema = z.object({
  workspace: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
  body: z.string().trim().min(1).max(4000),
  path: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^\/(?!\/)[^\\?#]*$/),
  expectedBody: z.string().max(4000),
  expectedPath: z.string().max(500),
})
export async function editFeedback(userId: string, input: unknown) {
  const data = feedbackEditSchema.parse(input),
    workspace = await requireWorkspace(userId, data.workspace)
  const comment = await db.query.deploymentFeedback.findFirst({
    where: and(
      eq(deploymentFeedback.id, data.id),
      eq(deploymentFeedback.workspaceId, workspace.id),
    ),
  })
  if (!comment) throw new HttpError(404, 'Feedback not found.', 'not_found')
  if (comment.authorId !== userId)
    throw new HttpError(
      403,
      'Only the author can edit this feedback.',
      'forbidden',
    )
  const version = await db.query.deployments.findFirst({
    where: eq(deployments.id, comment.deploymentId),
  })
  if (!version) throw new HttpError(404, 'Version not found.', 'not_found')
  return withSiteLock(version.siteId, workspace.ownerId, async (tx) => {
    const assignment = await tx.query.workspaceSites.findFirst({
      where: and(
        eq(workspaceSites.siteId, version.siteId),
        eq(workspaceSites.workspaceId, workspace.id),
      ),
    })
    if (!assignment)
      throw new HttpError(404, 'Site not found in this workspace.', 'not_found')
    const fresh = await tx.query.deploymentFeedback.findFirst({
      where: and(
        eq(deploymentFeedback.id, data.id),
        eq(deploymentFeedback.workspaceId, workspace.id),
        eq(deploymentFeedback.authorId, userId),
      ),
    })
    if (!fresh) throw new HttpError(404, 'Feedback not found.', 'not_found')
    if (fresh.body !== data.expectedBody || fresh.path !== data.expectedPath)
      throw new HttpError(
        409,
        'Feedback changed elsewhere. Cancel and reload before editing again.',
        'feedback_conflict',
      )
    await tx
      .update(deploymentFeedback)
      .set({ body: data.body, path: data.path, editedAt: new Date() })
      .where(eq(deploymentFeedback.id, data.id))
    return { saved: true }
  })
}

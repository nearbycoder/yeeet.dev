import { randomUUID } from 'node:crypto'
import { and, desc, eq, or } from 'drizzle-orm'
import { db } from '#/db'
import {
  deploymentFeedback,
  deployments,
  sites,
  user,
  workspaceMembers,
  workspaceSites,
  workspaces,
} from '#/db/schema'
import { canEditWorkspace, workspaceActionSchema } from '#/lib/workspaces'
import { HttpError } from './http'
import {
  activateSiteVersion,
  listSites,
  listSiteVersions,
  normalizeSlug,
} from './deployments'
import { compareDeployments } from './deployment-inspection'
import type { Actor } from './actor'
import type { WorkspaceRole } from '#/lib/workspaces'

export async function requireWorkspace(
  userId: string,
  id: string,
  mode: 'read' | 'edit' | 'owner' = 'read',
) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, id),
  })
  if (!workspace) throw new HttpError(404, 'Workspace not found.', 'not_found')
  const member =
    workspace.ownerId === userId
      ? null
      : await db.query.workspaceMembers.findFirst({
          where: and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.userId, userId),
          ),
        })
  const role: WorkspaceRole | null =
    workspace.ownerId === userId
      ? 'owner'
      : member?.role === 'editor'
        ? 'editor'
        : member?.role === 'viewer'
          ? 'viewer'
          : null
  if (!role) throw new HttpError(404, 'Workspace not found.', 'not_found')
  if (
    (mode === 'owner' && role !== 'owner') ||
    (mode === 'edit' && !canEditWorkspace(role))
  )
    throw new HttpError(
      403,
      'Your workspace role does not allow this action.',
      'forbidden',
    )
  if (workspace.ownerId !== userId) {
    const owner = await db.query.user.findFirst({
      where: eq(user.id, workspace.ownerId),
    })
    if (!owner || owner.banned)
      throw new HttpError(403, 'Workspace owner is unavailable.', 'forbidden')
  }
  return { ...workspace, role }
}
async function workspaceSite(
  workspaceId: string,
  ownerId: string,
  slug: string,
) {
  const siteRows = await db
    .select({ id: sites.id, slug: sites.slug })
    .from(workspaceSites)
    .innerJoin(sites, eq(sites.id, workspaceSites.siteId))
    .where(
      and(
        eq(workspaceSites.workspaceId, workspaceId),
        eq(sites.userId, ownerId),
        eq(sites.slug, normalizeSlug(slug)),
      ),
    )
    .limit(1)
  const site = siteRows.at(0)
  if (!site)
    throw new HttpError(404, 'Site not found in this workspace.', 'not_found')
  return site
}
export async function actorForWorkspaceSite(actor: Actor, slug?: string) {
  if (!slug?.trim()) return actor
  const site = await db.query.sites.findFirst({
    where: eq(sites.slug, normalizeSlug(slug)),
  })
  if (!site || site.userId === actor.userId) return actor
  const assignment = await db.query.workspaceSites.findFirst({
    where: eq(workspaceSites.siteId, site.id),
  })
  if (!assignment)
    throw new HttpError(409, 'That site name is already flying.', 'slug_taken')
  const workspace = await requireWorkspace(
    actor.userId,
    assignment.workspaceId,
    'edit',
  )
  if (workspace.ownerId !== site.userId)
    throw new HttpError(403, 'Site ownership changed.', 'forbidden')
  return { ...actor, userId: site.userId, actingUserId: actor.userId }
}
export async function actorForWorkspaceDeployment(
  actor: Actor,
  deploymentId: string,
) {
  const deploymentRows = await db
    .select({ slug: sites.slug })
    .from(deployments)
    .innerJoin(sites, eq(deployments.siteId, sites.id))
    .where(eq(deployments.id, deploymentId))
    .limit(1)
  const row = deploymentRows.at(0)
  return row ? actorForWorkspaceSite(actor, row.slug) : actor
}
export async function workspaceConsole(
  userId: string,
  selection: { workspace?: string; site?: string; version?: string },
) {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      ownerId: workspaces.ownerId,
      memberRole: workspaceMembers.role,
    })
    .from(workspaces)
    .leftJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, workspaces.id),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(
      or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId)),
    )
    .orderBy(desc(workspaces.createdAt))
  const ownedSites = await listSites(userId)
  if (!selection.workspace)
    return { workspaces: rows, ownedSites, selected: null }
  const workspace = await requireWorkspace(userId, selection.workspace)
  const [members, assignedSites] = await Promise.all([
    db
      .select({
        userId: user.id,
        name: user.name,
        email: user.email,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(user, eq(workspaceMembers.userId, user.id))
      .where(eq(workspaceMembers.workspaceId, workspace.id)),
    db
      .select({ id: sites.id, slug: sites.slug })
      .from(workspaceSites)
      .innerJoin(sites, eq(workspaceSites.siteId, sites.id))
      .where(
        and(
          eq(workspaceSites.workspaceId, workspace.id),
          eq(sites.userId, workspace.ownerId),
        ),
      ),
  ])
  const site = selection.site
    ? await workspaceSite(workspace.id, workspace.ownerId, selection.site)
    : null
  const history = site
    ? await listSiteVersions(workspace.ownerId, site.slug)
    : null
  const version =
    history?.versions.find((item) => item.id === selection.version) ??
    history?.versions[0] ??
    null
  const comments = version
    ? await db
        .select({
          id: deploymentFeedback.id,
          authorId: deploymentFeedback.authorId,
          author: user.name,
          body: deploymentFeedback.body,
          path: deploymentFeedback.path,
          resolved: deploymentFeedback.resolved,
          createdAt: deploymentFeedback.createdAt,
        })
        .from(deploymentFeedback)
        .leftJoin(user, eq(user.id, deploymentFeedback.authorId))
        .where(
          and(
            eq(deploymentFeedback.workspaceId, workspace.id),
            eq(deploymentFeedback.deploymentId, version.id),
          ),
        )
        .orderBy(desc(deploymentFeedback.createdAt))
        .limit(100)
    : []
  const comparison =
    version && site
      ? await compareDeployments(
          workspace.ownerId,
          site.slug,
          version.id,
          history?.site.activeDeploymentId ?? undefined,
        )
      : null
  return {
    workspaces: rows,
    ownedSites,
    selected: {
      ...workspace,
      createdAt: workspace.createdAt.toISOString(),
      members,
      sites: assignedSites,
      history,
      version,
      comparison,
      comments: comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
    },
  }
}
export async function mutateWorkspace(userId: string, input: unknown) {
  const data = workspaceActionSchema.parse(input)
  if (data.action === 'create') {
    const id = randomUUID()
    await db.insert(workspaces).values({ id, ownerId: userId, name: data.name })
    return { id }
  }
  const ownerActions = ['rename', 'delete', 'member', 'remove-member', 'site']
  const workspace = await requireWorkspace(
    userId,
    data.workspace,
    ownerActions.includes(data.action)
      ? 'owner'
      : data.action === 'promote' || data.action === 'resolve'
        ? 'edit'
        : 'read',
  )
  switch (data.action) {
    case 'rename':
      await db
        .update(workspaces)
        .set({ name: data.name })
        .where(eq(workspaces.id, workspace.id))
      break
    case 'delete':
      await db.delete(workspaces).where(eq(workspaces.id, workspace.id))
      break
    case 'member': {
      const account = await db.query.user.findFirst({
        where: eq(user.email, data.email.trim().toLowerCase()),
      })
      if (!account || account.banned)
        throw new HttpError(
          400,
          'Use the email of an existing, active Yeeet account.',
          'invalid_member',
        )
      if (account.id === userId)
        throw new HttpError(
          400,
          'The owner already has full access.',
          'invalid_member',
        )
      await db
        .insert(workspaceMembers)
        .values({
          id: randomUUID(),
          workspaceId: workspace.id,
          userId: account.id,
          role: data.role,
        })
        .onConflictDoUpdate({
          target: [workspaceMembers.workspaceId, workspaceMembers.userId],
          set: { role: data.role },
        })
      break
    }
    case 'remove-member':
      await db
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspace.id),
            eq(workspaceMembers.userId, data.userId),
          ),
        )
      break
    case 'site': {
      const site = await db.query.sites.findFirst({
        where: and(
          eq(sites.slug, normalizeSlug(data.slug)),
          eq(sites.userId, userId),
        ),
      })
      if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
      if (data.remove)
        await db
          .delete(workspaceSites)
          .where(
            and(
              eq(workspaceSites.workspaceId, workspace.id),
              eq(workspaceSites.siteId, site.id),
            ),
          )
      else {
        const assignment = await db.query.workspaceSites.findFirst({
          where: eq(workspaceSites.siteId, site.id),
        })
        if (assignment && assignment.workspaceId !== workspace.id)
          throw new HttpError(
            409,
            'Remove this site from its current workspace first.',
            'site_assigned',
          )
        await db
          .insert(workspaceSites)
          .values({
            id: randomUUID(),
            workspaceId: workspace.id,
            siteId: site.id,
          })
          .onConflictDoNothing()
      }
      break
    }
    case 'promote':
      await workspaceSite(workspace.id, workspace.ownerId, data.slug)
      await activateSiteVersion(workspace.ownerId, data.slug, data.version)
      break
    case 'comment': {
      const site = await workspaceSite(
        workspace.id,
        workspace.ownerId,
        data.slug,
      )
      const version = await db.query.deployments.findFirst({
        where: and(
          eq(deployments.id, data.version),
          eq(deployments.siteId, site.id),
        ),
      })
      if (!version) throw new HttpError(404, 'Version not found.', 'not_found')
      await db.insert(deploymentFeedback).values({
        id: randomUUID(),
        workspaceId: workspace.id,
        deploymentId: version.id,
        authorId: userId,
        body: data.body,
        path: data.path,
      })
      break
    }
    case 'resolve':
    case 'delete-comment': {
      const comment = await db.query.deploymentFeedback.findFirst({
        where: and(
          eq(deploymentFeedback.id, data.feedbackId),
          eq(deploymentFeedback.workspaceId, workspace.id),
        ),
      })
      if (!comment) throw new HttpError(404, 'Feedback not found.', 'not_found')
      if (data.action === 'delete-comment') {
        if (comment.authorId !== userId && workspace.role !== 'owner')
          throw new HttpError(
            403,
            'Only the author or workspace owner can delete feedback.',
            'forbidden',
          )
        await db
          .delete(deploymentFeedback)
          .where(eq(deploymentFeedback.id, comment.id))
      } else
        await db
          .update(deploymentFeedback)
          .set({ resolved: data.resolved })
          .where(eq(deploymentFeedback.id, comment.id))
      break
    }
  }
  return { id: workspace.id }
}

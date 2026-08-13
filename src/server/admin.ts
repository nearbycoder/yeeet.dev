import { randomUUID } from 'node:crypto'
import { count, desc, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  adminEvents,
  customDomains,
  deployments,
  session,
  sites,
  user,
} from '#/db/schema'
import type { Actor } from './actor'
import { HttpError } from './http'
import { siteUrl } from './platform-config'
import { removeRailwayCustomDomain } from './custom-domains'
import {
  createInvitation,
  listInvitations,
  revokeInvitation,
} from './invitations'
import { deleteStoredPrefix } from './storage'

async function audit(input: {
  actorId: string
  action: string
  targetUserId?: string | null
  details?: Record<string, unknown>
}) {
  await db.insert(adminEvents).values({
    id: randomUUID(),
    actorId: input.actorId,
    targetUserId: input.targetUserId,
    action: input.action,
    details: input.details ? JSON.stringify(input.details) : null,
  })
}

export async function adminOverview() {
  const [users, siteRows, invitationRows, eventRows] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
        siteCount: count(sites.id),
      })
      .from(user)
      .leftJoin(sites, eq(sites.userId, user.id))
      .groupBy(user.id)
      .orderBy(desc(user.createdAt)),
    db
      .select({
        id: sites.id,
        slug: sites.slug,
        ownerId: sites.userId,
        ownerEmail: user.email,
        activeDeploymentId: sites.activeDeploymentId,
        updatedAt: sites.updatedAt,
        deploymentCount: count(deployments.id),
        totalBytes: sql<number>`coalesce(sum(${deployments.totalBytes}), 0)`,
      })
      .from(sites)
      .innerJoin(user, eq(user.id, sites.userId))
      .leftJoin(deployments, eq(deployments.siteId, sites.id))
      .groupBy(sites.id, user.email)
      .orderBy(desc(sites.updatedAt)),
    listInvitations(),
    db
      .select({
        id: adminEvents.id,
        action: adminEvents.action,
        details: adminEvents.details,
        actorId: adminEvents.actorId,
        targetUserId: adminEvents.targetUserId,
        createdAt: adminEvents.createdAt,
      })
      .from(adminEvents)
      .orderBy(desc(adminEvents.createdAt))
      .limit(30),
  ])

  return {
    counts: {
      users: users.length,
      bannedUsers: users.filter((entry) => entry.banned).length,
      sites: siteRows.length,
      deployments: siteRows.reduce(
        (total, site) => total + Number(site.deploymentCount),
        0,
      ),
    },
    users: users.map((entry) => ({
      ...entry,
      siteCount: Number(entry.siteCount),
      banExpires: entry.banExpires?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
    sites: siteRows.map((site) => ({
      ...site,
      deploymentCount: Number(site.deploymentCount),
      totalBytes: Number(site.totalBytes),
      updatedAt: site.updatedAt.toISOString(),
      url: siteUrl(site.slug),
    })),
    invitations: invitationRows,
    events: eventRows.map((event) => ({
      ...event,
      details: event.details ? JSON.parse(event.details) : null,
      createdAt: event.createdAt.toISOString(),
    })),
  }
}

async function targetAccount(id: string) {
  const account = await db.query.user.findFirst({ where: eq(user.id, id) })
  if (!account) throw new HttpError(404, 'Account not found.', 'not_found')
  return account
}

export async function banAccount(
  actor: Actor,
  userId: string,
  reason?: string,
) {
  if (actor.userId === userId) {
    throw new HttpError(400, 'You cannot suspend yourself.', 'invalid_target')
  }
  const account = await targetAccount(userId)
  if (account.role.split(',').includes('admin')) {
    throw new HttpError(
      409,
      'Demote an administrator before suspending them.',
      'admin_account',
    )
  }
  const banReason = reason?.trim().slice(0, 500) || 'Platform policy violation'
  await db.transaction(async (tx) => {
    await tx
      .update(user)
      .set({ banned: true, banReason, banExpires: null })
      .where(eq(user.id, userId))
    await tx.delete(session).where(eq(session.userId, userId))
  })
  await audit({
    actorId: actor.userId,
    targetUserId: userId,
    action: 'account.suspended',
    details: { email: account.email, reason: banReason },
  })
  return { id: userId, banned: true, banReason }
}

export async function reinstateAccount(actor: Actor, userId: string) {
  const account = await targetAccount(userId)
  await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, userId))
  await audit({
    actorId: actor.userId,
    targetUserId: userId,
    action: 'account.reinstated',
    details: { email: account.email },
  })
  return { id: userId, banned: false }
}

export async function setAccountRole(
  actor: Actor,
  userId: string,
  role: 'admin' | 'user',
) {
  if (actor.userId === userId && role !== 'admin') {
    throw new HttpError(400, 'You cannot demote yourself.', 'invalid_target')
  }
  const account = await targetAccount(userId)
  await db.update(user).set({ role }).where(eq(user.id, userId))
  await audit({
    actorId: actor.userId,
    targetUserId: userId,
    action: 'account.role_changed',
    details: { email: account.email, role },
  })
  return { id: userId, role }
}

export async function deleteSite(actor: Actor, siteId: string) {
  const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')

  const domains = await db.query.customDomains.findMany({
    where: eq(customDomains.siteId, site.id),
  })
  await Promise.all(
    domains.map((domain) => removeRailwayCustomDomain(domain.railwayDomainId)),
  )
  const deletedObjects = await deleteStoredPrefix(`sites/${site.id}/`)
  await db.delete(sites).where(eq(sites.id, site.id))
  await audit({
    actorId: actor.userId,
    targetUserId: site.userId,
    action: 'site.deleted',
    details: {
      slug: site.slug,
      deletedObjects,
      customDomains: domains.map((domain) => domain.hostname),
    },
  })
  return { id: site.id, slug: site.slug, deletedObjects }
}

export async function issueInvitation(actor: Actor, label?: string) {
  const invitation = await createInvitation({
    createdBy: actor.userId,
    label,
  })
  await audit({
    actorId: actor.userId,
    action: 'invitation.created',
    details: { id: invitation.id, label: invitation.label },
  })
  return invitation
}

export async function disableInvitation(actor: Actor, id: string) {
  const invitation = await revokeInvitation(id)
  await audit({
    actorId: actor.userId,
    action: 'invitation.revoked',
    details: { id },
  })
  return invitation
}

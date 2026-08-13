import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { invitations } from '#/db/schema'
import { HttpError } from './http'

const GRANT_COOKIE = 'yeeet_invitation'
const GRANT_TTL_SECONDS = 10 * 60

export function hashInvitationCode(value: string) {
  return createHash('sha256').update(value.trim()).digest('hex')
}

export async function validateInvitationCode(value?: string | null) {
  if (!value?.trim()) {
    throw new HttpError(
      403,
      'Yeeet is invite-only. Enter a valid invitation code.',
      'invitation_required',
    )
  }
  const invitation = await db.query.invitations.findFirst({
    where: and(
      eq(invitations.codeHash, hashInvitationCode(value)),
      eq(invitations.active, true),
    ),
  })
  if (!invitation) {
    throw new HttpError(
      403,
      'That invitation code is invalid or has been revoked.',
      'invalid_invitation',
    )
  }
  return invitation
}

function grantSecret() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required.')
  return secret
}

export function createInvitationGrant(invitationId: string) {
  const expires = Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS
  const payload = `${invitationId}.${expires}`
  const signature = createHmac('sha256', grantSecret())
    .update(payload)
    .digest('base64url')
  return `${payload}.${signature}`
}

function invitationIdFromGrant(value?: string | null) {
  if (!value) return null
  const [invitationId, expiresValue, signature] = value.split('.')
  const expires = Number(expiresValue)
  if (!invitationId || !expires || !signature || expires < Date.now() / 1000) {
    return null
  }
  const payload = `${invitationId}.${expires}`
  const expected = createHmac('sha256', grantSecret())
    .update(payload)
    .digest('base64url')
  const signatureBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
    ? invitationId
    : null
}

function cookieValue(headers?: Headers | null) {
  const cookie = headers?.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === GRANT_COOKIE) return decodeURIComponent(rest.join('='))
  }
  return null
}

export async function validateInvitationGrant(headers?: Headers | null) {
  const id = invitationIdFromGrant(cookieValue(headers))
  if (!id) {
    throw new HttpError(
      403,
      'A valid invitation is required to create an account.',
      'invitation_required',
    )
  }
  const invitation = await db.query.invitations.findFirst({
    where: and(eq(invitations.id, id), eq(invitations.active, true)),
  })
  if (!invitation) {
    throw new HttpError(
      403,
      'That invitation has been revoked.',
      'invalid_invitation',
    )
  }
  return invitation
}

export function invitationGrantCookie(grant: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${GRANT_COOKIE}=${encodeURIComponent(grant)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${GRANT_TTL_SECONDS}${secure}`
}

export async function recordInvitationUse(invitationId: string) {
  await db
    .update(invitations)
    .set({
      useCount: sql`${invitations.useCount} + 1`,
      lastUsedAt: new Date(),
    })
    .where(eq(invitations.id, invitationId))
}

export async function listInvitations() {
  const rows = await db
    .select({
      id: invitations.id,
      codeHint: invitations.codeHint,
      label: invitations.label,
      active: invitations.active,
      useCount: invitations.useCount,
      lastUsedAt: invitations.lastUsedAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .orderBy(desc(invitations.createdAt))
  return rows.map((row) => ({
    ...row,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

export async function createInvitation(input: {
  createdBy: string
  label?: string
}) {
  const code = `invite_${randomBytes(18).toString('base64url')}`
  const row = {
    id: randomUUID(),
    codeHash: hashInvitationCode(code),
    codeHint: `…${code.slice(-6)}`,
    label: input.label?.trim().slice(0, 80) || 'General access',
    createdBy: input.createdBy,
  }
  await db.insert(invitations).values(row)
  return {
    id: row.id,
    code,
    codeHint: row.codeHint,
    label: row.label,
    active: true,
  }
}

export async function revokeInvitation(id: string) {
  const rows = await db
    .update(invitations)
    .set({ active: false })
    .where(eq(invitations.id, id))
    .returning({ id: invitations.id, active: invitations.active })
  if (rows.length === 0) {
    throw new HttpError(404, 'Invitation not found.', 'not_found')
  }
  return rows[0]
}

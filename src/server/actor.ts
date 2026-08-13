import { auth } from '#/lib/auth'
import { db } from '#/db'
import { user } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { HttpError } from './http'

export type Actor = {
  userId: string
  email?: string
  name?: string
  authType: 'session' | 'api-key'
}

function bearerToken(request: Request) {
  const value = request.headers.get('authorization')
  return value?.toLowerCase().startsWith('bearer ')
    ? value.slice(7).trim()
    : null
}

export async function getActor(request: Request): Promise<Actor | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user) {
      return {
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
        authType: 'session',
      }
    }
  } catch {
    // An API key is not a Better Auth session token; try it below.
  }

  const token = request.headers.get('x-api-key') ?? bearerToken(request)
  if (!token) return null

  try {
    const result = await auth.api.verifyApiKey({ body: { key: token } })
    if (result.valid && result.key?.referenceId) {
      return { userId: result.key.referenceId, authType: 'api-key' }
    }
  } catch {
    return null
  }

  return null
}

export async function requireActor(request: Request) {
  const actor = await getActor(request)
  if (!actor) {
    throw new HttpError(
      401,
      'Log in or provide a valid YEEET_TOKEN.',
      'unauthorized',
    )
  }
  const account = await db.query.user.findFirst({
    where: eq(user.id, actor.userId),
  })
  if (!account) {
    throw new HttpError(401, 'This account no longer exists.', 'unauthorized')
  }
  if (account.banned) {
    throw new HttpError(
      403,
      account.banReason
        ? `This account has been suspended: ${account.banReason}`
        : 'This account has been suspended.',
      'account_suspended',
    )
  }
  return actor
}

export async function requireAdmin(request: Request) {
  const actor = await requireActor(request)
  const account = await db.query.user.findFirst({
    where: eq(user.id, actor.userId),
  })
  const roles = account?.role.split(',').map((role) => role.trim()) ?? []
  if (!roles.includes('admin')) {
    throw new HttpError(403, 'Administrator access required.', 'forbidden')
  }
  return { ...actor, role: 'admin' as const }
}

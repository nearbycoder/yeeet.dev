import { auth } from '#/lib/auth'
import { db } from '#/db'
import { user } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { HttpError } from './http'

export type Actor = {
  actingUserId?: string
  userId: string
  email?: string
  name?: string
  role?: string
  banned?: boolean
  authType: 'session' | 'api-key'
}

export function isAccountBanned(account: {
  banned: boolean
  banExpires: Date | null
}) {
  return (
    account.banned &&
    (!account.banExpires || account.banExpires.getTime() > Date.now())
  )
}

export function hasAdminRole(role?: string | null) {
  return (
    role
      ?.split(',')
      .map((entry) => entry.trim())
      .includes('admin') ?? false
  )
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
    const errorCode = result.error?.code
    if (errorCode === 'RATE_LIMITED' || errorCode === 'USAGE_EXCEEDED') {
      throw new HttpError(
        429,
        result.error?.message ||
          'API key rate limit exceeded. Wait a moment and try again.',
        'rate_limited',
      )
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
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
  if (isAccountBanned(account)) {
    throw new HttpError(
      403,
      account.banReason
        ? `This account has been suspended: ${account.banReason}`
        : 'This account has been suspended.',
      'account_suspended',
    )
  }
  return {
    ...actor,
    email: account.email,
    name: account.name,
    role: account.role,
    banned: false,
  }
}

export async function requireAdmin(request: Request) {
  const actor = await requireActor(request)
  if (!hasAdminRole(actor.role)) {
    throw new HttpError(403, 'Administrator access required.', 'forbidden')
  }
  return { ...actor, role: 'admin' as const }
}

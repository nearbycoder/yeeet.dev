import { z } from 'zod'
import { auth } from '#/lib/auth'
import { requireActor } from './actor'
import { HttpError } from './http'

async function context(request: Request) {
  const headers = new Headers(request.headers)
  headers.delete('authorization')
  headers.delete('x-api-key')
  const cookieRequest = new Request(request.url, { headers })
  const actor = await requireActor(cookieRequest)
  const current = await auth.api.getSession({ headers })
  if (
    actor.authType !== 'session' ||
    !current ||
    current.user.id !== actor.userId
  )
    throw new HttpError(
      401,
      'Sign in again to manage browser sessions.',
      'session_required',
    )
  return { headers, current }
}
export async function listBrowserSessions(request: Request) {
  const { headers, current } = await context(request)
  const sessions = await auth.api.listSessions({ headers })
  return {
    total: sessions.length,
    sessions: sessions
      .sort(
        (a, b) =>
          Number(b.id === current.session.id) -
            Number(a.id === current.session.id) ||
          b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, 50)
      .map((row) => ({
        id: row.id,
        current: row.id === current.session.id,
        userAgent: row.userAgent ?? 'Unknown browser',
        ipAddress: row.ipAddress ?? 'Unavailable',
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
      })),
  }
}
export async function revokeBrowserSession(request: Request, input: unknown) {
  const data = z
    .discriminatedUnion('action', [
      z.object({ action: z.literal('one'), id: z.string().min(1).max(200) }),
      z.object({ action: z.literal('others') }),
    ])
    .parse(input)
  const { headers, current } = await context(request)
  if (data.action === 'others') {
    await auth.api.revokeOtherSessions({ headers })
    return { ok: true }
  }
  if (data.id === current.session.id)
    throw new HttpError(
      400,
      'Use Sign out to end this session.',
      'current_session',
    )
  const sessions = await auth.api.listSessions({ headers })
  const target = sessions.find((row) => row.id === data.id)
  if (!target)
    throw new HttpError(
      404,
      'Session not found. Refresh the list.',
      'session_not_found',
    )
  await auth.api.revokeSession({ headers, body: { token: target.token } })
  return { ok: true }
}

import { createFileRoute } from '@tanstack/react-router'
import { errorResponse, json } from '#/server/http'
import { requireActor } from '#/server/actor'
import { db } from '#/db'
import { user } from '#/db/schema'
import { eq } from 'drizzle-orm'

export const Route = createFileRoute('/api/v1/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          const account = await db.query.user.findFirst({
            where: eq(user.id, actor.userId),
          })
          return json({
            user: {
              id: actor.userId,
              email: actor.email,
              name: actor.name,
              role: account?.role ?? 'user',
              banned: account?.banned ?? false,
            },
            authType: actor.authType,
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

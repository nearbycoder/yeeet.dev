import { createFileRoute } from '@tanstack/react-router'
import { errorResponse, json } from '#/server/http'
import { requireActor } from '#/server/actor'

export const Route = createFileRoute('/api/v1/me')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          return json({
            user: {
              id: actor.userId,
              email: actor.email,
              name: actor.name,
              role: actor.role,
              banned: actor.banned,
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

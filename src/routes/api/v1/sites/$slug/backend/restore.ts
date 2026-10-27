import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { errorResponse, json } from '#/server/http'
import { restoreSiteBackend } from '#/server/site-backend'

export const Route = createFileRoute('/api/v1/sites/$slug/backend/restore')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json().catch(() => ({}))) as {
            database?: unknown
            backup?: unknown
          }
          return json(await restoreSiteBackend(actor.userId, params.slug, body))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

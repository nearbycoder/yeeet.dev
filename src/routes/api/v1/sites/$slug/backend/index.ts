import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { errorResponse, json } from '#/server/http'
import { getSiteBackend } from '#/server/site-backend'

export const Route = createFileRoute('/api/v1/sites/$slug/backend/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(await getSiteBackend(actor.userId, params.slug))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

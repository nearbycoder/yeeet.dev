import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteOwnedSite } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(await deleteOwnedSite(actor.userId, params.slug))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

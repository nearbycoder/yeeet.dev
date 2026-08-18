import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { listSiteChannels } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/channels')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(await listSiteChannels(actor.userId, params.slug))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

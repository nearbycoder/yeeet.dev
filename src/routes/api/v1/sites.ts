import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { listSites } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          return json({ sites: await listSites(actor.userId) })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

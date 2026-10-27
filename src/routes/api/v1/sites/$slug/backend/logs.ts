import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { errorResponse, json } from '#/server/http'
import { getSiteBackendLogs } from '#/server/site-backend'

export const Route = createFileRoute('/api/v1/sites/$slug/backend/logs')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await getSiteBackendLogs(
              actor.userId,
              params.slug,
              new URL(request.url).searchParams.get('database'),
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

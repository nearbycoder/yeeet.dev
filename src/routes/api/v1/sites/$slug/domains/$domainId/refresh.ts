import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { refreshCustomDomain } from '#/server/custom-domains'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/domains/$domainId/refresh',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await refreshCustomDomain(
              actor.userId,
              params.slug,
              params.domainId,
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

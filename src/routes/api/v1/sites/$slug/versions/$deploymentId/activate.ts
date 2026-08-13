import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { activateSiteVersion } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId/activate',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await activateSiteVersion(
              actor.userId,
              params.slug,
              params.deploymentId,
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

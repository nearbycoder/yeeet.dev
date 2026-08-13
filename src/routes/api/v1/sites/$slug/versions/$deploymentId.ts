import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteSiteVersion } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId',
)({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await deleteSiteVersion(
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

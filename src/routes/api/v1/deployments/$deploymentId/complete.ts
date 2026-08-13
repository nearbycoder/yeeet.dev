import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { completeDeployment } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/deployments/$deploymentId/complete',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(await completeDeployment(actor, params.deploymentId))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { updateSiteVersionAccess } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

type AccessBody = {
  password?: string | null
  rotateShareLink?: boolean
}

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId/access',
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json()) as AccessBody
          return json(
            await updateSiteVersionAccess(
              actor.userId,
              params.slug,
              params.deploymentId,
              body,
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

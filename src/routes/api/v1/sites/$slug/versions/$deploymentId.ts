import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteSiteVersion, findSiteVersion } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const { history, version } = await findSiteVersion(
            actor.userId,
            params.slug,
            params.deploymentId,
          )
          return json(
            {
              site: history.site,
              version: {
                id: version.id,
                status: version.status,
                url: version.previewUrl,
                protected: version.protected,
              },
            },
            { headers: { 'cache-control': 'private, no-store' } },
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
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

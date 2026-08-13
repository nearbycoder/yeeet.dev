import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteCustomDomain } from '#/server/custom-domains'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/domains/$domainId/')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await deleteCustomDomain(
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

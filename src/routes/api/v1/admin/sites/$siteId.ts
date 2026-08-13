import { createFileRoute } from '@tanstack/react-router'
import { deleteSite } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/sites/$siteId')({
  server: {
    handlers: {
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          return json(await deleteSite(actor, params.siteId))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

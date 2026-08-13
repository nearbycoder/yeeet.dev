import { createFileRoute } from '@tanstack/react-router'
import { adminOverview } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          await requireAdmin(request)
          return json(await adminOverview())
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

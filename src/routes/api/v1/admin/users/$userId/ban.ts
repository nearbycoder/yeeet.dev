import { createFileRoute } from '@tanstack/react-router'
import { banAccount } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/users/$userId/ban')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          const body = (await request.json().catch(() => ({}))) as {
            reason?: string
          }
          return json(await banAccount(actor, params.userId, body.reason))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

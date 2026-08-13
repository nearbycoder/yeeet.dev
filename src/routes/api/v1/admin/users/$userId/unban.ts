import { createFileRoute } from '@tanstack/react-router'
import { reinstateAccount } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/users/$userId/unban')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          return json(await reinstateAccount(actor, params.userId))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

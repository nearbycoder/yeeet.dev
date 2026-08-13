import { createFileRoute } from '@tanstack/react-router'
import { disableInvitation } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/admin/invitations/$invitationId/revoke',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          return json(await disableInvitation(actor, params.invitationId))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

import { createFileRoute } from '@tanstack/react-router'
import { issueInvitation } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/invitations/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await requireAdmin(request)
          const body = (await request.json().catch(() => ({}))) as {
            label?: string
          }
          return json(await issueInvitation(actor, body.label), {
            status: 201,
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

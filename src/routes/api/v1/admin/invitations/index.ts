import { createFileRoute } from '@tanstack/react-router'
import { issueInvitation } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/invitations/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const actor = await requireAdmin(request)
          const body = await readJsonBody(request, { optional: true })
          if (body.label !== undefined && typeof body.label !== 'string') {
            throw new HttpError(
              400,
              'Invitation label must be a string.',
              'invalid_label',
            )
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

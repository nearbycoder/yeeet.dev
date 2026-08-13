import { createFileRoute } from '@tanstack/react-router'
import {
  createInvitationGrant,
  invitationGrantCookie,
  validateInvitationCode,
} from '#/server/invitations'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/invitations/authorize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { code?: string }
          const invitation = await validateInvitationCode(body.code)
          return json(
            { authorized: true },
            {
              headers: {
                'set-cookie': invitationGrantCookie(
                  createInvitationGrant(invitation.id),
                ),
              },
            },
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

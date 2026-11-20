import { createFileRoute } from '@tanstack/react-router'
import {
  createInvitationGrant,
  invitationGrantCookie,
  validateInvitationCode,
} from '#/server/invitations'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

export const Route = createFileRoute('/api/v1/invitations/authorize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await readJsonBody(request)
          if (body.code !== undefined && typeof body.code !== 'string') {
            throw new HttpError(
              400,
              'Invitation code must be a string.',
              'invalid_invitation',
            )
          }
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

import { createFileRoute } from '@tanstack/react-router'
import { setAccountRole } from '#/server/admin'
import { requireAdmin } from '#/server/actor'
import { HttpError, errorResponse, json, readJsonBody } from '#/server/http'

export const Route = createFileRoute('/api/v1/admin/users/$userId/role')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireAdmin(request)
          const body = await readJsonBody(request)
          if (body.role !== 'admin' && body.role !== 'user') {
            throw new HttpError(400, 'Invalid role.', 'invalid_role')
          }
          return json(await setAccountRole(actor, params.userId, body.role))
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

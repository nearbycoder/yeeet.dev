import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { updateSiteVersionAccess } from '#/server/deployments'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId/access',
)({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = await readJsonBody(request)
          if (
            body.password !== undefined &&
            body.password !== null &&
            typeof body.password !== 'string'
          ) {
            throw new HttpError(
              400,
              'Password must be a string or null.',
              'invalid_password',
            )
          }
          if (
            body.rotateShareLink !== undefined &&
            typeof body.rotateShareLink !== 'boolean'
          ) {
            throw new HttpError(
              400,
              'rotateShareLink must be a boolean.',
              'invalid_access_update',
            )
          }
          return json(
            await updateSiteVersionAccess(
              actor.userId,
              params.slug,
              params.deploymentId,
              {
                password: body.password,
                rotateShareLink: body.rotateShareLink,
              },
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

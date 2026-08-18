import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteSiteChannel, setSiteChannel } from '#/server/deployments'
import { errorResponse, HttpError, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/channels/$channel')({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json()) as { version?: string }
          if (!body.version) {
            throw new HttpError(
              400,
              'A version ID or prefix is required.',
              'invalid_version',
            )
          }
          return json(
            await setSiteChannel(
              actor.userId,
              params.slug,
              params.channel,
              body.version,
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await deleteSiteChannel(actor.userId, params.slug, params.channel),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

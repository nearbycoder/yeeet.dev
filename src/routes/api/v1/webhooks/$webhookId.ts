import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteWebhookEndpoint, updateWebhookEndpoint } from '#/server/webhooks'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/webhooks/$webhookId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json().catch(() => ({}))) as {
            url?: string
            label?: string
            events?: Array<string>
            active?: boolean
            rotateSecret?: boolean
          }
          return json(
            await updateWebhookEndpoint(actor.userId, params.webhookId, body),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await deleteWebhookEndpoint(actor.userId, params.webhookId),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

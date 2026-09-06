import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { retryWebhookDelivery } from '#/server/webhooks'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/webhooks/deliveries/$deliveryId/retry',
)({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json(
            await retryWebhookDelivery(actor.userId, params.deliveryId),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

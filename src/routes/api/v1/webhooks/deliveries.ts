import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { listWebhookDeliveries } from '#/server/webhooks'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/webhooks/deliveries')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          const limit = Number(
            new URL(request.url).searchParams.get('limit') || 50,
          )
          return json({
            deliveries: await listWebhookDeliveries(
              actor.userId,
              Number.isFinite(limit) ? limit : 50,
            ),
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

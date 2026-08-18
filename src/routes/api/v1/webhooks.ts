import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  WEBHOOK_EVENTS,
} from '#/server/webhooks'
import { errorResponse, HttpError, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/webhooks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          return json({
            webhooks: await listWebhookEndpoints(actor.userId),
            supportedEvents: WEBHOOK_EVENTS,
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json().catch(() => ({}))) as {
            url?: string
            label?: string
            events?: Array<string>
          }
          if (!body.url) {
            throw new HttpError(
              400,
              'A webhook URL is required.',
              'invalid_webhook_url',
            )
          }
          return json(
            await createWebhookEndpoint(actor.userId, {
              url: body.url,
              label: body.label,
              events: body.events,
            }),
            { status: 201 },
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

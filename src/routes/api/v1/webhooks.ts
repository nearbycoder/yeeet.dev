import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  WEBHOOK_EVENTS,
} from '#/server/webhooks'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

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
          const body = await readJsonBody(request)
          if (typeof body.url !== 'string' || !body.url.trim()) {
            throw new HttpError(
              400,
              'A webhook URL is required.',
              'invalid_webhook_url',
            )
          }
          if (body.label !== undefined && typeof body.label !== 'string') {
            throw new HttpError(
              400,
              'Webhook label must be a string.',
              'invalid_webhook_label',
            )
          }
          if (
            body.events !== undefined &&
            (!Array.isArray(body.events) ||
              body.events.some((event) => typeof event !== 'string'))
          ) {
            throw new HttpError(
              400,
              'Webhook events must be an array of event names.',
              'invalid_webhook_events',
            )
          }
          return json(
            await createWebhookEndpoint(actor.userId, {
              url: body.url,
              label: body.label,
              events: body.events as Array<string> | undefined,
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

import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { deleteWebhookEndpoint, updateWebhookEndpoint } from '#/server/webhooks'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

export const Route = createFileRoute('/api/v1/webhooks/$webhookId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = await readJsonBody(request)
          if (body.url !== undefined && typeof body.url !== 'string') {
            throw new HttpError(
              400,
              'Webhook URL must be a string.',
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
          if (body.active !== undefined && typeof body.active !== 'boolean') {
            throw new HttpError(
              400,
              'active must be a boolean.',
              'invalid_webhook_update',
            )
          }
          if (
            body.rotateSecret !== undefined &&
            typeof body.rotateSecret !== 'boolean'
          ) {
            throw new HttpError(
              400,
              'rotateSecret must be a boolean.',
              'invalid_webhook_update',
            )
          }
          return json(
            await updateWebhookEndpoint(actor.userId, params.webhookId, {
              url: body.url,
              label: body.label,
              events: body.events as Array<string> | undefined,
              active: body.active,
              rotateSecret: body.rotateSecret,
            }),
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

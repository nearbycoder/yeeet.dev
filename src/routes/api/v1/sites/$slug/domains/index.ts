import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { createCustomDomain, listCustomDomains } from '#/server/custom-domains'
import { errorResponse, HttpError, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/domains/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          return json({
            domains: await listCustomDomains(actor.userId, params.slug),
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
      POST: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json().catch(() => ({}))) as {
            domain?: string
          }
          if (!body.domain) {
            throw new HttpError(400, 'A domain is required.', 'invalid_domain')
          }
          return json(
            await createCustomDomain(actor.userId, params.slug, body.domain),
            { status: 201 },
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

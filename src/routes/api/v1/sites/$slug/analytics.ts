import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { getSiteAnalytics } from '#/server/analytics'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/analytics')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const days = Number(
            new URL(request.url).searchParams.get('days') || 30,
          )
          return json(
            await getSiteAnalytics(
              actor.userId,
              params.slug,
              Number.isFinite(days) ? days : 30,
            ),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

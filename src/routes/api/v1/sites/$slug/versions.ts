import { versionSearchSchema } from '#/lib/pagination'
import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import { listSiteVersions } from '#/server/deployments'
import { errorResponse, json } from '#/server/http'

export const Route = createFileRoute('/api/v1/sites/$slug/versions')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const filters = versionSearchSchema.parse(
            Object.fromEntries(new URL(request.url).searchParams),
          )
          return json(
            await listSiteVersions(actor.userId, params.slug, 100, filters),
          )
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

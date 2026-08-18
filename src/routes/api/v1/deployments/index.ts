import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import {
  createDeployment,
  listRecentDeployments,
  planDeployment,
} from '#/server/deployments'
import type { ManifestFile } from '#/server/deployments'
import { errorResponse, HttpError, json } from '#/server/http'

type CreateBody = {
  slug?: string
  files?: Array<ManifestFile>
  source?: 'web' | 'cli' | 'api'
  spaFallback?: boolean
  password?: string
  channel?: string
  dryRun?: boolean
  idempotencyKey?: string
}

export const Route = createFileRoute('/api/v1/deployments/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          return json({
            deployments: await listRecentDeployments(actor.userId),
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
      POST: async ({ request }) => {
        try {
          const actor = await requireActor(request)
          const body = (await request.json()) as CreateBody
          if (!body.files) {
            throw new HttpError(
              400,
              'A file manifest is required.',
              'invalid_manifest',
            )
          }
          const source = request.headers
            .get('x-yeeet-client')
            ?.startsWith('cli')
            ? 'cli'
            : body.source === 'api'
              ? 'api'
              : 'web'
          if (body.dryRun) {
            return json(
              await planDeployment({
                actor,
                slug: body.slug,
                files: body.files,
                channel: body.channel,
              }),
            )
          }
          const result = await createDeployment({
            actor,
            slug: body.slug,
            files: body.files,
            source,
            spaFallback: body.spaFallback,
            password: body.password,
            channel: body.channel,
            idempotencyKey:
              request.headers.get('idempotency-key') ?? body.idempotencyKey,
          })
          return json(result, { status: 201 })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

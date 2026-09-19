import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import {
  deploymentFileInput,
  previewDeploymentFile,
} from '#/server/deployment-file'
import { errorResponse, HttpError, json } from '#/server/http'

export const Route = createFileRoute(
  '/api/v1/sites/$slug/versions/$deploymentId/file',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const actor = await requireActor(request)
          const input = deploymentFileInput.safeParse({
            slug: params.slug,
            version: params.deploymentId,
            path: new URL(request.url).searchParams.get('path'),
          })
          if (!input.success)
            throw new HttpError(
              400,
              'Choose a valid version and file path.',
              'invalid_file',
            )
          return json(await previewDeploymentFile(actor.userId, input.data), {
            headers: {
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
            },
          })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

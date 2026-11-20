import { createFileRoute } from '@tanstack/react-router'
import { requireActor } from '#/server/actor'
import {
  createDeployment,
  listRecentDeployments,
  planDeployment,
} from '#/server/deployments'
import type { ManifestFile } from '#/server/deployments'
import { errorResponse, HttpError, json, readJsonBody } from '#/server/http'

function optionalString(
  value: unknown,
  field: string,
  code: string,
): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string.`, code)
  }
  return value
}

function optionalBoolean(
  value: unknown,
  field: string,
  code: string,
): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be a boolean.`, code)
  }
  return value
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
          const body = await readJsonBody(request)
          if (!Array.isArray(body.files)) {
            throw new HttpError(
              400,
              'A file manifest is required.',
              'invalid_manifest',
            )
          }
          const slug = optionalString(body.slug, 'slug', 'invalid_slug')
          const channel = optionalString(
            body.channel,
            'channel',
            'invalid_channel',
          )
          const password = optionalString(
            body.password,
            'password',
            'invalid_password',
          )
          const spaFallback = optionalBoolean(
            body.spaFallback,
            'spaFallback',
            'invalid_request',
          )
          const dryRun = optionalBoolean(
            body.dryRun,
            'dryRun',
            'invalid_request',
          )
          const bodyIdempotencyKey = optionalString(
            body.idempotencyKey,
            'idempotencyKey',
            'invalid_idempotency_key',
          )
          const source =
            request.headers.get('x-yeeet-client')?.startsWith('cli') ||
            body.source === 'cli'
              ? 'cli'
              : body.source === 'api'
                ? 'api'
                : 'web'
          if (dryRun) {
            return json(
              await planDeployment({
                actor,
                slug,
                files: body.files as Array<ManifestFile>,
                channel,
              }),
            )
          }
          const result = await createDeployment({
            actor,
            slug,
            files: body.files as Array<ManifestFile>,
            source,
            spaFallback,
            password,
            channel,
            idempotencyKey:
              request.headers.get('idempotency-key') ?? bodyIdempotencyKey,
          })
          return json(result, { status: 201 })
        } catch (error) {
          return errorResponse(error)
        }
      },
    },
  },
})

import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { deploymentFiles, deployments, sites } from '#/db/schema'
import { BackendLayoutError, describeBackend } from '#/lib/backend-layout'
import { signContext, verifyContext } from '../../packages/runtime/src/auth.js'
import { deploymentShareCookieName } from './deployment-access'
import { HttpError, json } from './http'
import { getStoredObject } from './storage'

export type BackendDescription = {
  entry: string
  files: Array<string>
  migrations: Array<{ name: string; path: string }>
  bytes: number
}

export type BackendPreparation = {
  entry: string
  database: string
  migrations: { total: number; pending: Array<string>; warnings: Array<string> }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const BUNDLE_PATH = /^\/_yeeet\/runtime\/bundles\/([0-9a-f-]{36})$/
const HOP_BY_HOP = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

export function backendRuntimeConfig() {
  const url = process.env.BACKEND_RUNTIME_URL?.trim()
  const secret = process.env.BACKEND_RUNTIME_SECRET ?? ''
  if (!url || secret.length < 32) return null
  return { url: url.replace(/\/+$/, ''), secret }
}

export function backendRuntimeEnabled() {
  return backendRuntimeConfig() !== null
}

/** Validate the manifest's backend files; null means a purely static deployment. */
export function backendFromManifest(
  files: Array<{ path: string; size: number }>,
): BackendDescription | null {
  let backend: BackendDescription | null
  try {
    backend = describeBackend(files)
  } catch (error) {
    if (error instanceof BackendLayoutError)
      throw new HttpError(400, error.message, error.code)
    throw error
  }
  if (backend && !backendRuntimeEnabled())
    throw new HttpError(
      400,
      'This Yeeet instance has no backend runtime configured, so _server.ts cannot run. Remove _server.ts, _server/, and _migrations/ to deploy static files only.',
      'backend_runtime_unavailable',
    )
  return backend
}

export function parseBackend(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value) as BackendDescription
  } catch {
    return null
  }
}

export function backendSummary(backend: BackendDescription | null) {
  if (!backend) return null
  return {
    entry: backend.entry,
    files: backend.files.length,
    migrations: backend.migrations.map((migration) => migration.name),
    routes: '/api/*',
  }
}

/** The SQLite database a hostname kind writes to. */
export function backendDatabase(
  target:
    | { kind: 'live' | 'custom' }
    | { kind: 'channel'; channel: string }
    | { kind: 'version'; deploymentId: string },
) {
  if (target.kind === 'channel') return `channel-${target.channel}`
  if (target.kind === 'version') return `version-${target.deploymentId}`
  return 'live'
}

async function callRuntime(
  context: Record<string, unknown>,
  init: RequestInit = {},
  timeoutMs = 60_000,
) {
  const config = backendRuntimeConfig()
  if (!config)
    throw new HttpError(
      503,
      'This Yeeet instance has no backend runtime configured.',
      'backend_runtime_unavailable',
    )
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(
    signContext(config.secret, context),
  ))
    headers.set(name, value)
  try {
    return await fetch(`${config.url}/_runtime/${String(context.op)}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    console.error('Backend runtime is unreachable', { op: context.op, error })
    throw new HttpError(
      503,
      'The backend runtime is unreachable. Try again shortly.',
      'backend_runtime_unavailable',
    )
  }
}

async function runtimeJson<T>(context: Record<string, unknown>) {
  const response = await callRuntime(context)
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string }
  }
  if (!response.ok)
    throw new HttpError(
      response.status >= 500 ? 503 : response.status,
      body.error?.message ?? 'The backend runtime rejected the request.',
      body.error?.code ?? 'backend_runtime_error',
    )
  return body as T
}

/**
 * Rehearse a backend before a hostname points at it: the runtime applies the
 * deployment's migrations to a snapshot of the target database and boots it.
 */
export async function prepareBackend(input: {
  siteId: string
  slug: string
  deploymentId: string
  database: string
}) {
  const result = await runtimeJson<
    | ({ ok: true } & BackendPreparation)
    | {
        ok: false
        error: {
          code: string
          message: string
          migration?: string
          logs?: Array<string>
        }
      }
  >({ op: 'prepare', ...input })
  if (!result.ok) {
    throw new HttpError(
      422,
      `Backend check failed: ${result.error.message}`,
      result.error.code === 'migration_changed' ||
        result.error.code === 'migration_failed'
        ? result.error.code
        : 'backend_start_failed',
      {
        migration: result.error.migration ?? null,
        logs: result.error.logs ?? [],
      },
    )
  }
  return {
    entry: result.entry,
    database: result.database,
    migrations: result.migrations,
  }
}

/** Prepare an existing deployment for a hostname when it has a backend. */
export async function prepareDeploymentBackend(
  deploymentId: string,
  database: string,
) {
  const rows = await db
    .select({
      backend: deployments.backend,
      siteId: deployments.siteId,
      slug: sites.slug,
    })
    .from(deployments)
    .innerJoin(sites, eq(deployments.siteId, sites.id))
    .where(eq(deployments.id, deploymentId))
    .limit(1)
  const row = rows.at(0)
  if (!row?.backend) return null
  return prepareBackend({
    siteId: row.siteId,
    slug: row.slug,
    deploymentId,
    database,
  })
}

/** Delete runtime data that belongs to a removed storage prefix. Never throws. */
export async function purgeBackendForPrefix(prefix: string) {
  if (!backendRuntimeEnabled()) return
  const match =
    /^sites\/([0-9a-f-]{36})\/(?:deployments\/([0-9a-f-]{36})\/)?$/.exec(prefix)
  if (!match) return
  try {
    const response = await callRuntime(
      {
        op: 'purge',
        siteId: match[1],
        ...(match[2] ? { database: `version-${match[2]}` } : {}),
      },
      {},
      15_000,
    )
    if (!response.ok)
      console.warn('Backend runtime purge failed', {
        prefix,
        status: response.status,
      })
  } catch (error) {
    console.warn('Backend runtime purge skipped', { prefix, error })
  }
}

export async function backendRuntimeOperation<T>(
  op: 'status' | 'logs' | 'restore',
  fields: Record<string, unknown>,
) {
  return runtimeJson<T>({ op, ...fields })
}

function publicBackendError(status: number, code: string, message: string) {
  return json(
    { error: { code, message } },
    {
      status,
      headers: { 'cache-control': 'private, no-store' },
    },
  )
}

/** Forward a public /api request to the site's backend through the runtime. */
export async function proxyBackendRequest(input: {
  request: Request
  publicUrl: URL
  siteId: string
  slug: string
  deploymentId: string
  database: string
  protectedDeployment: boolean
  noCrawl: boolean
}) {
  const config = backendRuntimeConfig()
  if (!config)
    return publicBackendError(
      503,
      'backend_unavailable',
      'This site’s backend is not available right now.',
    )
  const { request } = input
  const headers = new Headers(request.headers)
  for (const name of [...HOP_BY_HOP, 'host', 'content-length'])
    headers.delete(name)
  for (const name of [...headers.keys()]) {
    if (name.startsWith('x-yeeet-')) headers.delete(name)
  }
  const cookies = request.headers.get('cookie')
  if (cookies) {
    const shareCookie = deploymentShareCookieName(input.deploymentId)
    const kept = cookies
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith(`${shareCookie}=`))
    if (kept.length) headers.set('cookie', kept.join('; '))
    else headers.delete('cookie')
  }
  headers.set('x-forwarded-host', input.publicUrl.host)
  headers.set('x-forwarded-proto', input.publicUrl.protocol.replace(':', ''))
  const requestId = randomUUID()
  for (const [name, value] of Object.entries(
    signContext(config.secret, {
      op: 'request',
      siteId: input.siteId,
      slug: input.slug,
      deploymentId: input.deploymentId,
      database: input.database,
      url: input.publicUrl.href,
      requestId,
    }),
  ))
    headers.set(name, value)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  let upstream: Response
  try {
    const init: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
      signal: controller.signal,
    }
    // Node requires duplex for streamed request bodies.
    if (hasBody) init.duplex = 'half'
    upstream = await fetch(
      `${config.url}${input.publicUrl.pathname}${input.publicUrl.search}`,
      init,
    )
  } catch (error) {
    console.error('Backend request failed', {
      deploymentId: input.deploymentId,
      error,
    })
    return publicBackendError(
      controller.signal.aborted ? 504 : 502,
      controller.signal.aborted ? 'backend_timeout' : 'backend_unavailable',
      'This site’s backend is not available right now.',
    )
  } finally {
    clearTimeout(timeout)
  }

  const responseHeaders = new Headers(upstream.headers)
  for (const name of HOP_BY_HOP) responseHeaders.delete(name)
  // fetch already decoded any compressed body.
  if (responseHeaders.has('content-encoding')) {
    responseHeaders.delete('content-encoding')
    responseHeaders.delete('content-length')
  }
  if (!responseHeaders.has('cache-control') || input.protectedDeployment)
    responseHeaders.set('cache-control', 'private, no-store, max-age=0')
  if (!responseHeaders.has('x-content-type-options'))
    responseHeaders.set('x-content-type-options', 'nosniff')
  responseHeaders.set('x-yeeet-deployment', input.deploymentId)
  responseHeaders.set('x-yeeet-request-id', requestId)
  if (input.noCrawl || input.protectedDeployment)
    responseHeaders.set(
      'x-robots-tag',
      'noindex, nofollow, noarchive, nosnippet, noimageindex',
    )
  if (input.protectedDeployment) responseHeaders.append('vary', 'cookie')
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })
}

/**
 * Internal endpoint the runtime calls to download a deployment's backend source
 * and migrations. Authenticated with the shared runtime secret.
 */
export async function maybeServeRuntimeBundle(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url)
  const match = BUNDLE_PATH.exec(url.pathname)
  if (!match) return null
  const config = backendRuntimeConfig()
  const deploymentId = match[1]
  const context = config
    ? (verifyContext(config.secret, request.headers) as {
        op?: string
        deploymentId?: string
      } | null)
    : null
  if (
    request.method !== 'GET' ||
    !context ||
    context.op !== 'bundle' ||
    context.deploymentId !== deploymentId ||
    !UUID.test(deploymentId)
  )
    return json(
      { error: { code: 'not_found', message: 'Not found.' } },
      { status: 404 },
    )

  const rows = await db
    .select({
      id: deployments.id,
      siteId: deployments.siteId,
      status: deployments.status,
      backend: deployments.backend,
      slug: sites.slug,
    })
    .from(deployments)
    .innerJoin(sites, eq(deployments.siteId, sites.id))
    .where(eq(deployments.id, deploymentId))
    .limit(1)
  const deployment = rows.at(0)
  const backend = parseBackend(deployment?.backend)
  if (!deployment || !backend || deployment.status === 'failed')
    return json(
      { error: { code: 'not_found', message: 'No backend.' } },
      { status: 404 },
    )

  const paths = [
    ...backend.files,
    ...backend.migrations.map((migration) => migration.path),
  ]
  const files = await db
    .select({
      path: deploymentFiles.path,
      storageKey: deploymentFiles.storageKey,
    })
    .from(deploymentFiles)
    .where(
      and(
        eq(deploymentFiles.deploymentId, deploymentId),
        inArray(deploymentFiles.path, paths),
      ),
    )
  const contents = new Map<string, string>()
  try {
    await Promise.all(
      files.map(async (file) => {
        const object = await getStoredObject(file.storageKey)
        contents.set(file.path, (await object.Body?.transformToString()) ?? '')
      }),
    )
  } catch (error) {
    console.error('Could not read backend bundle', { deploymentId, error })
    return json(
      { error: { code: 'storage_unavailable', message: 'Storage failed.' } },
      { status: 503 },
    )
  }
  if (paths.some((path) => !contents.has(path)))
    return json(
      { error: { code: 'incomplete_bundle', message: 'Files are missing.' } },
      { status: 409 },
    )

  return json(
    {
      deploymentId,
      siteId: deployment.siteId,
      slug: deployment.slug,
      entry: backend.entry,
      files: backend.files.map((path) => ({
        path,
        content: contents.get(path),
      })),
      migrations: backend.migrations.map((migration) => ({
        name: migration.name,
        sql: contents.get(migration.path),
      })),
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}

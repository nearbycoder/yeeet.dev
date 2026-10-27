#!/usr/bin/env bun
// Yeeet backend runtime: runs site _server.ts handlers on demand for the gateway.

import { verifyContext } from './auth.js'
import { BundleStore } from './bundles.js'
import { runtimeConfig } from './config.js'
import {
  RuntimeError,
  SiteStore,
  UUID,
  assertDatabaseName,
  assertSiteId,
} from './site-store.js'
import { WorkerPool } from './workers.js'

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

// Public requests never receive runtime details such as recent log lines.
function failure(error, includeDetails) {
  if (error instanceof RuntimeError)
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(includeDetails && error.details
            ? { details: error.details }
            : {}),
        },
      },
      error.status,
    )
  console.error('[runtime] unexpected error', error)
  return json(
    {
      error: { code: 'runtime_error', message: 'The backend runtime failed.' },
    },
    500,
  )
}

export function createRuntime(config, options = {}) {
  const sites = new SiteStore({
    dataDir: config.dataDir,
    isolation: config.isolation,
  })
  const bundles = new BundleStore({
    dataDir: config.dataDir,
    controlPlaneUrl: config.controlPlaneUrl,
    secret: config.secret,
    sites,
    fetchImpl: options.fetchImpl,
  })
  const pool = new WorkerPool({ sites, bundles, config })

  async function handle(request) {
    const url = new URL(request.url)
    if (url.pathname === '/health' && request.method === 'GET')
      return json({ ok: true, workers: pool.workers.size })
    const context = verifyContext(config.secret, request.headers)
    if (!context)
      return json(
        {
          error: {
            code: 'unauthorized',
            message: 'Invalid runtime signature.',
          },
        },
        401,
      )
    try {
      switch (context.op) {
        case 'request': {
          if (!UUID.test(context.deploymentId ?? ''))
            throw new RuntimeError(
              400,
              'invalid_deployment',
              'Invalid deployment id.',
            )
          assertSiteId(context.siteId)
          assertDatabaseName(context.database)
          return await pool.request(context, request)
        }
        case 'prepare':
          if (!UUID.test(context.deploymentId ?? ''))
            throw new RuntimeError(
              400,
              'invalid_deployment',
              'Invalid deployment id.',
            )
          assertSiteId(context.siteId)
          assertDatabaseName(context.database)
          return json(await pool.prepare(context))
        case 'status':
          return json(pool.status(assertSiteId(context.siteId)))
        case 'logs':
          if (context.database) assertDatabaseName(context.database)
          return json({
            entries: pool.recentLogs(
              assertSiteId(context.siteId),
              context.database,
            ),
          })
        case 'purge':
          if (context.database) assertDatabaseName(context.database)
          return json(
            await pool.purge(assertSiteId(context.siteId), context.database),
          )
        case 'restore':
          return json(
            await pool.restore(
              assertSiteId(context.siteId),
              assertDatabaseName(context.database),
              context.backup,
            ),
          )
        default:
          throw new RuntimeError(
            400,
            'unknown_operation',
            'Unknown runtime operation.',
          )
      }
    } catch (error) {
      return failure(error, context.op !== 'request')
    }
  }

  return { handle, pool, sites, bundles }
}

/** Confirm this container may start processes as another user. */
async function canDropPrivileges(bunPath) {
  try {
    const probe = Bun.spawn([bunPath, '-e', '0'], {
      uid: 65534,
      gid: 65534,
      stdout: 'ignore',
      stderr: 'ignore',
    })
    return (await probe.exited) === 0
  } catch {
    return false
  }
}

if (import.meta.main) {
  const config = runtimeConfig()
  if (config.isolation && !(await canDropPrivileges(config.bunPath))) {
    if (
      !process.env.RUNTIME_ISOLATION ||
      process.env.RUNTIME_ISOLATION === 'required'
    ) {
      console.error(
        '[runtime] RUNTIME_ISOLATION=required, but this container cannot start processes as another user (missing CAP_SETUID/CAP_SETGID).',
      )
      process.exit(1)
    }
    console.error(
      '[runtime] This container cannot start processes as another user; per-site isolation is disabled.',
    )
    config.isolation = false
  }
  const runtime = createRuntime(config)
  runtime.pool.start()
  const server = Bun.serve({
    port: config.port,
    hostname: config.hostname,
    maxRequestBodySize: 10 * 1024 * 1024,
    idleTimeout: 120,
    fetch: runtime.handle,
  })
  console.log(
    `[runtime] listening on ${server.url} · data ${config.dataDir} · isolation ${config.isolation ? 'per-site users' : 'off'}`,
  )
  if (!config.isolation)
    console.warn(
      '[runtime] Site workers share this process user. Run as root (the default container) to give every site its own OS user.',
    )
  const shutdown = async () => {
    await runtime.pool.shutdown()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

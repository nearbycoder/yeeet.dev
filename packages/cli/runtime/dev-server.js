#!/usr/bin/env bun
// Local Yeeet emulator for sites with a _server.ts backend. Runs under Bun.
//
//   bun dev-server.js serve <dir> [--port 8787] [--host 127.0.0.1] [--database dev] [--reset] [--static]
//   bun dev-server.js check <dir> [--json]
//
// It uses the same harness, migration engine, and layout rules as production.

import { Database } from 'bun:sqlite'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  watch,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BACKEND_DIRECTORY,
  BACKEND_ENTRIES,
  BackendLayoutError,
  MIGRATIONS_DIRECTORY,
  describeBackend,
  isBackendRoute,
  isPrivateBackendPath,
} from './backend-layout.js'
import { MigrationError, applyMigrations } from './migrations.js'

const HARNESS_PATH = fileURLToPath(new URL('./harness.js', import.meta.url))
const DEV_DATABASE = /^[a-z0-9][a-z0-9-]{0,62}$/

function parseArgs(argv) {
  const [mode, dir = '.', ...rest] = argv
  const options = { mode, dir: resolve(dir) }
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index]
    if (flag === '--reset') options.reset = true
    else if (flag === '--static') options.static = true
    else if (flag === '--json') options.json = true
    else if (flag === '--port') options.port = Number(rest[++index])
    else if (flag === '--host') options.host = rest[++index]
    else if (flag === '--database') options.database = rest[++index]
    else throw new Error(`Unknown option ${flag}`)
  }
  return options
}

function walk(root, relative = '') {
  const absolute = join(root, relative)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = relative ? `${relative}/${entry.name}` : entry.name
    if (entry.isDirectory()) return walk(root, path)
    return entry.isFile()
      ? [{ path, size: statSync(join(root, path)).size }]
      : []
  })
}

/** Read the backend in a site folder, or null for a static site. */
export function loadBackend(dir) {
  const files = [
    ...BACKEND_ENTRIES.filter((entry) => existsSync(join(dir, entry))).map(
      (path) => ({ path, size: statSync(join(dir, path)).size }),
    ),
    ...walk(dir, BACKEND_DIRECTORY.slice(0, -1)),
    ...walk(dir, MIGRATIONS_DIRECTORY.slice(0, -1)),
  ]
  const backend = describeBackend(files)
  if (!backend) return null
  return {
    ...backend,
    migrations: backend.migrations.map((migration) => ({
      name: migration.name,
      sql: readFileSync(join(dir, migration.path), 'utf8'),
    })),
  }
}

/** Copy only what production receives, so imports outside _server/ fail locally too. */
function stageBundle(dir, backend, stateDir) {
  const target = join(stateDir, 'bundle')
  rmSync(target, { recursive: true, force: true })
  for (const path of backend.files) {
    mkdirSync(dirname(join(target, path)), { recursive: true })
    copyFileSync(join(dir, path), join(target, path))
  }
  return target
}

async function startWorker({ bundleDir, backend, dbPath, site, logs }) {
  const socket = join(
    tmpdir(),
    `yeeet-dev-${process.pid}-${Date.now().toString(36)}.sock`,
  )
  let settle
  const ready = new Promise((resolvePromise, reject) => {
    settle = { resolve: resolvePromise, reject }
  })
  const proc = Bun.spawn([process.execPath, '--no-install', HARNESS_PATH], {
    cwd: bundleDir,
    env: {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? tmpdir(),
      TMPDIR: tmpdir(),
      TZ: 'UTC',
      NODE_ENV: 'development',
      YEEET_ENTRY: join(bundleDir, backend.entry),
      YEEET_DB: dbPath,
      YEEET_SOCKET: socket,
      YEEET_SITE: JSON.stringify(site),
    },
    stdin: 'ignore',
    stdout: logs,
    stderr: logs,
    ipc(message) {
      if (message?.type === 'ready') settle.resolve()
      if (message?.type === 'error') settle.reject(new Error(message.message))
    },
  })
  const output = []
  if (logs === 'pipe')
    for (const stream of [proc.stdout, proc.stderr])
      new Response(stream).text().then((text) => output.push(text))
  proc.exited.then((code) =>
    settle.reject(
      new Error(`The backend exited during startup (code ${code}).`),
    ),
  )
  const timeout = setTimeout(
    () =>
      settle.reject(new Error('The backend did not start within 10 seconds.')),
    10_000,
  )
  try {
    await ready
  } catch (error) {
    proc.kill('SIGKILL')
    rmSync(socket, { force: true })
    await Promise.race([proc.exited, Bun.sleep(200)])
    error.logs = output.join('').trim().split('\n').filter(Boolean).slice(-20)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  return {
    proc,
    socket,
    async stop() {
      proc.kill('SIGTERM')
      await Promise.race([proc.exited, Bun.sleep(2000)])
      proc.kill('SIGKILL')
      rmSync(socket, { force: true })
    },
  }
}

async function check(options) {
  const report = { status: 'passed', backend: null, errors: [], warnings: [] }
  const fail = (code, message, extra = {}) => {
    report.status = 'failed'
    report.errors.push({ code, message, ...extra })
  }
  let backend = null
  try {
    backend = loadBackend(options.dir)
  } catch (error) {
    if (!(error instanceof BackendLayoutError)) throw error
    fail(error.code, error.message)
  }
  if (backend) {
    report.backend = {
      entry: backend.entry,
      files: backend.files,
      migrations: backend.migrations.map((migration) => migration.name),
    }
    const scratch = mkdtempSync(join(tmpdir(), 'yeeet-check-'))
    const dbPath = join(scratch, 'check.sqlite')
    try {
      const db = new Database(dbPath, { create: true })
      try {
        db.run('PRAGMA foreign_keys = ON')
        const result = applyMigrations(db, backend.migrations, {
          deploymentId: 'check',
        })
        report.warnings.push(
          ...result.warnings.map((message) => ({ code: 'migration', message })),
        )
      } catch (error) {
        if (!(error instanceof MigrationError)) throw error
        fail(error.code, error.message, { migration: error.migration })
      } finally {
        db.close()
      }
      if (report.status === 'passed') {
        try {
          const worker = await startWorker({
            bundleDir: stageBundle(options.dir, backend, scratch),
            backend,
            dbPath,
            site: { slug: 'check', deploymentId: 'check', database: 'check' },
            logs: 'pipe',
          })
          await worker.stop()
        } catch (error) {
          fail('backend_start_failed', error.message, {
            logs: error.logs ?? [],
          })
        }
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }
  console.log(JSON.stringify(report))
  process.exitCode = report.status === 'passed' ? 0 : 1
}

function candidatePaths(pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = pathname
  }
  const clean = decoded.replace(/^\/+/, '').replaceAll('\\', '/')
  if (clean.split('/').includes('..')) return []
  if (!clean || clean.endsWith('/')) return [`${clean}index.html`]
  if (!clean.split('/').at(-1)?.includes('.'))
    return [clean, `${clean}.html`, `${clean}/index.html`]
  return [clean]
}

function servable(dir, path) {
  if (
    isPrivateBackendPath(path) ||
    path === '_headers' ||
    path === '_redirects' ||
    /(^|\/)(\.git|\.yeeet|node_modules)(\/|$)/.test(path)
  )
    return null
  const absolute = join(dir, path)
  return existsSync(absolute) && statSync(absolute).isFile() ? absolute : null
}

async function serve(options) {
  const dir = options.dir
  const projectConfig = existsSync(join(dir, '.yeeet.json'))
    ? JSON.parse(readFileSync(join(dir, '.yeeet.json'), 'utf8'))
    : {}
  const spaFallback = options.static
    ? false
    : (projectConfig.spaFallback ?? true)
  const database = options.database || 'dev'
  if (!DEV_DATABASE.test(database))
    throw new Error(
      '--database must be lowercase letters, numbers, or hyphens.',
    )
  const stateDir = join(dir, '.yeeet', 'dev')
  mkdirSync(stateDir, { recursive: true })
  const dbPath = join(stateDir, `${database}.sqlite`)
  if (options.reset)
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(`${dbPath}${suffix}`, { force: true })

  let worker = null
  let backendError = null
  let backend = null
  let restarting = Promise.resolve()

  async function start() {
    backendError = null
    try {
      backend = loadBackend(dir)
    } catch (error) {
      backend = null
      backendError = {
        code: error.code ?? 'backend_error',
        message: error.message,
      }
      console.error(`  ✗ ${error.message}`)
      return { backend: null, started: false }
    }
    if (!backend) return { backend: null, started: false }
    const db = new Database(dbPath, { create: true })
    try {
      db.run('PRAGMA busy_timeout = 5000')
      db.run('PRAGMA journal_mode = WAL')
      db.run('PRAGMA foreign_keys = ON')
      const result = applyMigrations(db, backend.migrations, {
        deploymentId: 'dev',
      })
      if (result.applied.length)
        console.log(`  ↑ applied ${result.applied.join(', ')}`)
      for (const warning of result.warnings) console.warn(`  ! ${warning}`)
    } catch (error) {
      backendError = {
        code: error.code ?? 'migration_failed',
        message: error.message,
      }
      console.error(`  ✗ ${error.message}`)
      if (error.code === 'migration_changed')
        console.error(
          '    Run `yeeet dev --reset` to rebuild the local database from your migrations.',
        )
      return { backend, started: false }
    } finally {
      db.close()
    }
    try {
      worker = await startWorker({
        bundleDir: stageBundle(dir, backend, stateDir),
        backend,
        dbPath,
        site: {
          slug: projectConfig.name ?? 'dev',
          deploymentId: 'dev',
          database,
        },
        logs: 'inherit',
      })
    } catch (error) {
      backendError = { code: 'backend_start_failed', message: error.message }
      console.error(`  ✗ ${error.message}`)
      return { backend, started: false }
    }
    return { backend, started: true }
  }

  function restart() {
    restarting = restarting.then(async () => {
      if (worker) await worker.stop()
      worker = null
      if ((await start()).started) console.log('  ↻ backend reloaded')
    })
    return restarting
  }

  const { backend: initialBackend } = await start()

  let debounce = null
  watch(dir, { recursive: true }, (_event, name) => {
    const path = String(name ?? '').replaceAll('\\', '/')
    if (!isPrivateBackendPath(path)) return
    clearTimeout(debounce)
    debounce = setTimeout(restart, 120)
  })

  const server = Bun.serve({
    port: options.port ?? 8787,
    hostname: options.host ?? '127.0.0.1',
    maxRequestBodySize: 10 * 1024 * 1024,
    idleTimeout: 60,
    async fetch(request) {
      const url = new URL(request.url)
      if (isBackendRoute(url.pathname) && (backend || backendError)) {
        await restarting
        if (!worker)
          return Response.json(
            {
              error: backendError ?? {
                code: 'backend_unavailable',
                message: 'The backend is not running.',
              },
            },
            { status: 503 },
          )
        const headers = new Headers(request.headers)
        for (const name of [...headers.keys()])
          if (name.startsWith('x-yeeet-')) headers.delete(name)
        headers.set('x-yeeet-url', url.href)
        try {
          const response = await fetch(
            `http://localhost${url.pathname}${url.search}`,
            {
              unix: worker.socket,
              method: request.method,
              headers,
              body:
                request.method === 'GET' || request.method === 'HEAD'
                  ? undefined
                  : request.body,
              redirect: 'manual',
              decompress: false,
              signal: AbortSignal.timeout(30_000),
            },
          )
          const responseHeaders = new Headers(response.headers)
          if (!responseHeaders.has('cache-control'))
            responseHeaders.set('cache-control', 'private, no-store, max-age=0')
          return new Response(response.body, {
            status: response.status,
            headers: responseHeaders,
          })
        } catch (error) {
          const timedOut = error?.name === 'TimeoutError'
          return Response.json(
            {
              error: {
                code: timedOut ? 'backend_timeout' : 'backend_unavailable',
                message: timedOut
                  ? 'The backend did not respond within 30 seconds.'
                  : error.message,
              },
            },
            { status: timedOut ? 504 : 502 },
          )
        }
      }
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response('Method not allowed', { status: 405 })
      const candidates = candidatePaths(url.pathname)
      let file = candidates.map((path) => servable(dir, path)).find(Boolean)
      let status = 200
      const segment = url.pathname.split('/').at(-1) ?? ''
      const accept = request.headers.get('accept')
      if (
        !file &&
        spaFallback &&
        !segment.includes('.') &&
        (!accept || accept.includes('text/html'))
      )
        file = servable(dir, 'index.html')
      if (!file && servable(dir, '404.html')) {
        file = servable(dir, '404.html')
        status = 404
      }
      if (!file) return new Response('Not found', { status: 404 })
      return new Response(request.method === 'HEAD' ? null : Bun.file(file), {
        status,
        headers: { 'cache-control': 'no-store' },
      })
    },
  })

  console.log(`\n  Yeeet dev server → ${server.url}`)
  console.log(`  static   ${dir}${spaFallback ? ' (SPA fallback)' : ''}`)
  if (initialBackend)
    console.log(
      `  backend  ${initialBackend.entry} → /api/* · ${initialBackend.migrations.length} migration${initialBackend.migrations.length === 1 ? '' : 's'} · db ${dbPath}`,
    )
  if (existsSync(join(dir, '_redirects')) || existsSync(join(dir, '_headers')))
    console.log(
      '  note     _headers and _redirects apply after deploy, not in dev',
    )
  console.log('')

  const shutdown = async () => {
    server.stop(true)
    if (worker) await worker.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (import.meta.main) {
  const options = parseArgs(process.argv.slice(2))
  const run =
    options.mode === 'check' ? check : options.mode === 'serve' ? serve : null
  if (!run) {
    console.error('Usage: dev-server.js serve|check <dir> [options]')
    process.exit(1)
  }
  run(options).catch((error) => {
    if (options.mode === 'check') {
      console.log(
        JSON.stringify({
          status: 'failed',
          backend: null,
          errors: [
            { code: error.code ?? 'check_failed', message: error.message },
          ],
          warnings: [],
        }),
      )
    } else console.error(`  ✗ ${error.message}`)
    process.exit(1)
  })
}

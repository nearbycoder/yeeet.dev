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
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  watch,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
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

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.yeeet'])

function walk(root, relativePath = '') {
  const absolute = join(root, relativePath)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) return []
    const path = relativePath ? `${relativePath}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) return []
      return walk(root, path)
    }
    return entry.isFile()
      ? [{ path, size: statSync(join(root, path)).size }]
      : []
  })
}

/** Read the backend in a site folder, or null for a static site. */
export function loadBackend(dir) {
  const files = [
    ...BACKEND_ENTRIES.filter((entry) => {
      const full = join(dir, entry)
      try {
        return lstatSync(full).isFile()
      } catch {
        return false
      }
    }).map((path) => ({ path, size: statSync(join(dir, path)).size })),
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

async function startWorker({ bundleDir, backend, dbPath, site, logs, onExit }) {
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
  const pipePromises =
    logs === 'pipe'
      ? [proc.stdout, proc.stderr].map((stream) =>
          new Response(stream)
            .text()
            .then((text) => output.push(text))
            .catch(() => undefined),
        )
      : []
  let stopping = false
  proc.exited.then((code) => {
    settle.reject(
      new Error(`The backend exited during startup (code ${code}).`),
    )
    rmSync(socket, { force: true })
    if (!stopping) onExit?.(code)
  })
  const timeout = setTimeout(
    () =>
      settle.reject(new Error('The backend did not start within 10 seconds.')),
    10_000,
  )
  try {
    await ready
  } catch (error) {
    stopping = true
    proc.kill('SIGKILL')
    rmSync(socket, { force: true })
    await Promise.race([
      Promise.allSettled([proc.exited, ...pipePromises]),
      Bun.sleep(300),
    ])
    error.logs = output.join('').trim().split('\n').filter(Boolean).slice(-20)
    throw error
  } finally {
    clearTimeout(timeout)
  }
  return {
    proc,
    socket,
    async stop() {
      stopping = true
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
  if (decoded.includes('\0')) return []
  const normalized = decoded.replaceAll('\\', '/')
  const rawParts = normalized.split('/')
  const parts = []
  for (const part of rawParts) {
    if (part === '..') return []
    if (!part || part === '.') continue
    parts.push(part)
  }
  const clean = parts.join('/')
  if (!clean) return ['index.html']
  if (normalized.endsWith('/')) return [`${clean}/index.html`]
  if (!parts.at(-1)?.includes('.'))
    return [clean, `${clean}.html`, `${clean}/index.html`]
  return [clean]
}

function servable(dir, path, rootReal = realpathSync(dir)) {
  if (
    isPrivateBackendPath(path) ||
    path === '_headers' ||
    path === '_redirects' ||
    /(^|\/)(\.git|\.yeeet|node_modules)(\/|$)/.test(path)
  )
    return null
  const absolute = join(dir, path)
  try {
    const info = lstatSync(absolute)
    if (info.isSymbolicLink() || !info.isFile()) return null
    const fileReal = realpathSync(absolute)
    const rel = relative(rootReal, fileReal)
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
    return fileReal
  } catch {
    return null
  }
}

async function serve(options) {
  const dir = options.dir
  const rootReal = realpathSync(dir)
  const port = options.port ?? 8787
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('--port must be an integer between 1 and 65535.')
  let projectConfig = {}
  const configFile = join(dir, '.yeeet.json')
  if (existsSync(configFile)) {
    try {
      const parsed = JSON.parse(readFileSync(configFile, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        projectConfig = parsed
    } catch {
      throw new Error('.yeeet.json contains invalid JSON.')
    }
  }
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
      const startedWorker = await startWorker({
        bundleDir: stageBundle(dir, backend, stateDir),
        backend,
        dbPath,
        site: {
          slug: projectConfig.name ?? 'dev',
          deploymentId: 'dev',
          database,
        },
        logs: 'inherit',
        onExit(code) {
          if (worker === startedWorker) {
            worker = null
            console.error(
              `  ! backend worker exited unexpectedly (code ${code}); restarting on next request`,
            )
          }
        },
      })
      worker = startedWorker
    } catch (error) {
      backendError = { code: 'backend_start_failed', message: error.message }
      console.error(`  ✗ ${error.message}`)
      return { backend, started: false }
    }
    return { backend, started: true }
  }

  function restart() {
    restarting = restarting
      .catch(() => undefined)
      .then(async () => {
        if (worker) await worker.stop().catch(() => undefined)
        worker = null
        if ((await start()).started) console.log('  ↻ backend reloaded')
      })
      .catch((error) => {
        backendError = {
          code: 'backend_reload_failed',
          message: error instanceof Error ? error.message : String(error),
        }
        console.error(`  ✗ ${backendError.message}`)
      })
    return restarting
  }

  const { backend: initialBackend } = await start()

  let debounce = null
  const watcher = watch(dir, { recursive: true }, (_event, name) => {
    const path = String(name ?? '').replaceAll('\\', '/')
    if (/(^|\/)(\.git|\.yeeet|node_modules)(\/|$)/.test(path)) return
    if (!isPrivateBackendPath(path)) return
    clearTimeout(debounce)
    debounce = setTimeout(restart, 120)
  })

  const server = Bun.serve({
    port,
    hostname: options.host ?? '127.0.0.1',
    maxRequestBodySize: 10 * 1024 * 1024,
    idleTimeout: 60,
    async fetch(request) {
      const url = new URL(request.url)
      if (isBackendRoute(url.pathname) && (backend || backendError)) {
        await restarting
        if (!worker && backend && !backendError) await restart()
        const activeWorker = worker
        if (!activeWorker)
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
        headers.set('host', url.host)
        headers.set('x-yeeet-url', url.href)
        try {
          const response = await fetch(
            `http://localhost${url.pathname}${url.search}`,
            {
              unix: activeWorker.socket,
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
          if (timedOut && worker === activeWorker) {
            worker = null
            void activeWorker.stop().catch(() => undefined)
          }
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
      let file = candidates
        .map((path) => servable(dir, path, rootReal))
        .find(Boolean)
      let status = 200
      const segment = url.pathname.split('/').at(-1) ?? ''
      const accept = request.headers.get('accept')
      if (
        !file &&
        spaFallback &&
        !segment.includes('.') &&
        (!accept || accept.includes('text/html'))
      )
        file = servable(dir, 'index.html', rootReal)
      if (!file && servable(dir, '404.html', rootReal)) {
        file = servable(dir, '404.html', rootReal)
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

  let shuttingDown = false
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    clearTimeout(debounce)
    watcher.close()
    server.stop(true)
    if (worker) await worker.stop().catch(() => undefined)
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

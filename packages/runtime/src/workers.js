// Starts site backends on demand, migrates their databases, proxies requests,
// and stops idle or misbehaving workers.

import { Database } from 'bun:sqlite'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyMigrations,
  appliedMigrations,
  MigrationError,
} from './migrations.js'
import { RuntimeError, assertDatabaseName, assertSiteId } from './site-store.js'

const HARNESS_PATH = fileURLToPath(new URL('./harness.js', import.meta.url))
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
const LOG_LINES = 300

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`
}

function backupStamp() {
  return new Date().toISOString().replaceAll(':', '').replace('.', '')
}

/** Copy a live SQLite database safely, even while a worker is writing to it. */
function snapshotDatabase(source, target) {
  const db = new Database(source, { readonly: true })
  try {
    db.run(`VACUUM INTO ${sqlString(target)}`)
  } finally {
    db.close()
  }
}

export class WorkerPool {
  constructor({ sites, bundles, config }) {
    this.sites = sites
    this.bundles = bundles
    this.config = config
    this.workers = new Map()
    this.locks = new Map()
    this.logs = new Map()
    this.socketCounter = 0
    this.timers = []
  }

  start() {
    this.timers.push(
      setInterval(() => this.reapIdle(), 15_000),
      setInterval(() => this.enforceMemory(), 5_000),
      setInterval(
        () =>
          this.bundles.collectGarbage(
            7 * 24 * 60 * 60_000,
            new Set([...this.workers.values()].map((w) => w.deploymentId)),
          ),
        60 * 60_000,
      ),
    )
    for (const timer of this.timers) timer.unref?.()
  }

  async shutdown() {
    for (const timer of this.timers) clearInterval(timer)
    await Promise.all([...this.workers.values()].map((w) => this.stop(w)))
  }

  key(siteId, database) {
    return `${assertSiteId(siteId)}/${assertDatabaseName(database)}`
  }

  async withLock(key, task) {
    const previous = this.locks.get(key) ?? Promise.resolve()
    const run = previous.catch(() => {}).then(task)
    const tail = run.catch(() => {})
    this.locks.set(key, tail)
    try {
      return await run
    } finally {
      if (this.locks.get(key) === tail) this.locks.delete(key)
    }
  }

  log(key, stream, line) {
    let lines = this.logs.get(key)
    if (!lines) {
      lines = []
      this.logs.set(key, lines)
    }
    lines.push({
      at: new Date().toISOString(),
      stream,
      line: line.slice(0, 4000),
    })
    if (lines.length > LOG_LINES) lines.splice(0, lines.length - LOG_LINES)
    const label = `[${key}]`
    if (stream === 'stderr') console.error(label, line)
    else console.log(label, line)
  }

  /** Back up, then apply pending migrations to a database file. */
  migrate(siteId, database, bundle, { dbPath, backup = true } = {}) {
    const path = dbPath ?? this.sites.databasePath(siteId, database)
    const existed = existsSync(path) && statSync(path).size > 0
    const db = new Database(path, { create: true })
    try {
      db.run('PRAGMA busy_timeout = 5000')
      db.run('PRAGMA journal_mode = WAL')
      db.run('PRAGMA foreign_keys = ON')
      const migrations = bundle.migrations
      const appliedNames = new Set(appliedMigrations(db).map((row) => row.name))
      const hasPending = migrations.some((m) => !appliedNames.has(m.name))
      let backupName = null
      if (backup && existed && hasPending) {
        backupName = this.backup(
          siteId,
          database,
          'pre-migrate',
          bundle.deploymentId,
          db,
        )
      }
      const result = applyMigrations(db, migrations, {
        deploymentId: bundle.deploymentId,
      })
      return { ...result, backup: backupName }
    } finally {
      db.close()
      if (!dbPath)
        this.sites.restoreOwnership(siteId, this.sites.databaseDir(siteId))
    }
  }

  backup(siteId, database, reason, deploymentId, openDb) {
    const dir = this.sites.backupDir(siteId, database)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const name = `${backupStamp()}_${reason}${deploymentId ? `_${deploymentId.slice(0, 8)}` : ''}_${randomUUID().slice(0, 8)}.sqlite`
    const target = join(dir, name)
    if (openDb) openDb.run(`VACUUM INTO ${sqlString(target)}`)
    else snapshotDatabase(this.sites.databasePath(siteId, database), target)
    const backups = this.listBackups(siteId, database).filter(
      (backup) => backup.name !== name,
    )
    for (const old of backups.slice(this.config.backupsToKeep - 1)) {
      rmSync(join(dir, old.name), { force: true })
    }
    return name
  }

  listBackups(siteId, database) {
    const dir = this.sites.backupDir(siteId, database)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.endsWith('.sqlite'))
      .sort()
      .reverse()
      .map((name) => ({ name, sizeBytes: statSync(join(dir, name)).size }))
  }

  async spawn({ key, siteId, database, bundle, dbPath, slug }) {
    const owner = this.sites.user(siteId)
    const socket = join(
      this.sites.socketDir(siteId),
      `w${(this.socketCounter += 1)}.sock`,
    )
    rmSync(socket, { force: true })
    const tmp = this.sites.tmpDir(siteId)
    let settle
    const ready = new Promise((resolve, reject) => {
      settle = { resolve, reject }
    })
    const startup = { error: null }
    const proc = Bun.spawn(
      [this.config.bunPath, '--smol', '--no-install', HARNESS_PATH],
      {
        cwd: bundle.sourceDir,
        env: {
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          HOME: tmp,
          TMPDIR: tmp,
          TZ: 'UTC',
          NODE_ENV: 'production',
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0',
          YEEET_ENTRY: bundle.entryPath,
          YEEET_DB: dbPath,
          YEEET_SOCKET: socket,
          YEEET_SITE: JSON.stringify({
            slug: slug ?? bundle.slug ?? null,
            deploymentId: bundle.deploymentId,
            database,
          }),
        },
        ...(owner ? { uid: owner.uid, gid: owner.gid } : {}),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ipc: (message) => {
          if (message?.type === 'ready') settle.resolve()
          if (message?.type === 'error') {
            startup.error = message
            settle.reject(new Error(message.message))
          }
        },
      },
    )
    const worker = {
      key,
      siteId,
      database,
      deploymentId: bundle.deploymentId,
      proc,
      socket,
      inflight: 0,
      startedAt: Date.now(),
      lastUsed: Date.now(),
      stopping: false,
    }
    this.pipe(key, proc.stdout, 'stdout')
    this.pipe(key, proc.stderr, 'stderr')
    proc.exited.then((code) => {
      settle.reject(
        new Error(`The backend exited during startup (code ${code}).`),
      )
      if (this.workers.get(key) === worker) this.workers.delete(key)
      if (!worker.stopping)
        this.log(key, 'stderr', `[yeeet] worker exited with code ${code}`)
      rmSync(socket, { force: true })
    })
    const timeout = setTimeout(
      () => settle.reject(new Error('The backend did not start in time.')),
      this.config.startTimeoutMs,
    )
    try {
      await ready
    } catch (error) {
      worker.stopping = true
      proc.kill('SIGKILL')
      const recent = (this.logs.get(key) ?? [])
        .slice(-20)
        .map((entry) => entry.line)
      throw new RuntimeError(502, 'backend_start_failed', errorMessage(error), {
        stack: startup.error?.stack ?? null,
        logs: recent,
      })
    } finally {
      clearTimeout(timeout)
    }
    return worker
  }

  async pipe(key, stream, name) {
    if (!stream) return
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for await (const chunk of stream) {
        buffer += decoder.decode(chunk, { stream: true })
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          this.log(key, name, buffer.slice(0, index))
          buffer = buffer.slice(index + 1)
        }
        if (buffer.length > 8000) {
          this.log(key, name, buffer)
          buffer = ''
        }
      }
    } catch {
      // The process ended; whatever is buffered is flushed below.
    }
    if (buffer) this.log(key, name, buffer)
  }

  async stop(worker, { drainMs = 0 } = {}) {
    worker.stopping = true
    const deadline = Date.now() + drainMs
    while (worker.inflight > 0 && Date.now() < deadline) {
      await Bun.sleep(25)
    }
    if (this.workers.get(worker.key) === worker) this.workers.delete(worker.key)
    worker.proc.kill('SIGTERM')
    const exited = await Promise.race([
      worker.proc.exited.then(() => true),
      Bun.sleep(3_000).then(() => false),
    ])
    if (!exited) {
      worker.proc.kill('SIGKILL')
      await worker.proc.exited
    }
  }

  /** Return a ready worker for this site database running the requested deployment. */
  async acquire(context) {
    const key = this.key(context.siteId, context.database)
    return this.withLock(key, async () => {
      const existing = this.workers.get(key)
      if (
        existing &&
        !existing.stopping &&
        existing.deploymentId === context.deploymentId
      )
        return existing
      const bundle = await this.bundles.get(
        context.deploymentId,
        context.siteId,
      )
      if (existing) {
        this.log(
          key,
          'stdout',
          `[yeeet] switching to deployment ${context.deploymentId}`,
        )
        await this.stop(existing, { drainMs: 10_000 })
      }
      this.sites.ensureSite(context.siteId)
      let migration
      try {
        migration = this.migrate(context.siteId, context.database, bundle)
      } catch (error) {
        if (error instanceof MigrationError) {
          this.log(key, 'stderr', `[yeeet] ${error.message}`)
          throw new RuntimeError(503, error.code, error.message, {
            migration: error.migration,
          })
        }
        throw error
      }
      if (migration.applied.length)
        this.log(
          key,
          'stdout',
          `[yeeet] applied ${migration.applied.join(', ')}${migration.backup ? ` (backup ${migration.backup})` : ''}`,
        )
      for (const warning of migration.warnings)
        this.log(key, 'stderr', `[yeeet] ${warning}`)
      const worker = await this.spawn({
        key,
        siteId: context.siteId,
        database: context.database,
        bundle,
        slug: context.slug,
        dbPath: this.sites.databasePath(context.siteId, context.database),
      })
      this.workers.set(key, worker)
      this.evict()
      return worker
    })
  }

  /** Proxy a public request to the site's backend. */
  async request(context, incoming) {
    const worker = await this.acquire(context)
    worker.inflight += 1
    worker.lastUsed = Date.now()
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      worker.inflight -= 1
      worker.lastUsed = Date.now()
    }
    const url = new URL(context.url)
    const headers = new Headers(incoming.headers)
    for (const name of HOP_BY_HOP) headers.delete(name)
    for (const name of [...headers.keys()]) {
      if (name.startsWith('x-yeeet-')) headers.delete(name)
    }
    headers.set('x-yeeet-url', url.href)
    if (context.requestId) headers.set('x-yeeet-request-id', context.requestId)
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(new Error('timeout')),
      this.config.requestTimeoutMs,
    )
    let response
    try {
      response = await fetch(`http://localhost${url.pathname}${url.search}`, {
        unix: worker.socket,
        method: incoming.method,
        headers,
        body:
          incoming.method === 'GET' || incoming.method === 'HEAD'
            ? undefined
            : incoming.body,
        redirect: 'manual',
        decompress: false,
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timeout)
      finish()
      if (controller.signal.aborted) {
        // A CPU-bound handler cannot observe cancellation. Terminate it so the
        // next request gets a fresh worker instead of timing out forever.
        worker.stopping = true
        worker.proc.kill('SIGKILL')
        await worker.proc.exited
        throw new RuntimeError(
          504,
          'backend_timeout',
          `The backend did not respond within ${Math.round(this.config.requestTimeoutMs / 1000)} seconds.`,
        )
      }
      throw new RuntimeError(502, 'backend_unreachable', errorMessage(error))
    }
    const responseHeaders = new Headers(response.headers)
    for (const name of HOP_BY_HOP) responseHeaders.delete(name)
    if (!response.body) {
      clearTimeout(timeout)
      finish()
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })
    }
    // Headers arrived in time; let the body stream at its own pace.
    clearTimeout(timeout)
    const reader = response.body.getReader()
    const body = new ReadableStream({
      async pull(stream) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            stream.close()
            finish()
          } else stream.enqueue(value)
        } catch (error) {
          stream.error(error)
          finish()
        }
      },
      cancel(reason) {
        finish()
        return reader.cancel(reason)
      },
    })
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  }

  /**
   * Rehearse a deployment before it receives traffic: apply its migrations to a
   * snapshot of the target database and boot it against that snapshot.
   */
  async prepare(context) {
    const bundle = await this.bundles.get(context.deploymentId, context.siteId)
    this.sites.ensureSite(context.siteId)
    const rehearsal = join(
      this.sites.tmpDir(context.siteId),
      `prepare-${randomUUID()}`,
    )
    mkdirSync(rehearsal, { recursive: true, mode: 0o700 })
    const dbPath = join(rehearsal, 'rehearsal.sqlite')
    const source = this.sites.databasePath(context.siteId, context.database)
    const key = `${this.key(context.siteId, context.database)}#prepare`
    try {
      if (existsSync(source)) snapshotDatabase(source, dbPath)
      let migration
      try {
        migration = this.migrate(context.siteId, context.database, bundle, {
          dbPath,
          backup: false,
        })
      } catch (error) {
        if (error instanceof MigrationError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
              migration: error.migration,
            },
          }
        throw error
      }
      this.sites.restoreOwnership(context.siteId, rehearsal)
      this.logs.delete(key)
      try {
        const worker = await this.spawn({
          key,
          siteId: context.siteId,
          database: context.database,
          bundle,
          slug: context.slug,
          dbPath,
        })
        await this.stop(worker)
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error.code ?? 'backend_start_failed',
            message: errorMessage(error),
            logs: error.details?.logs ?? [],
          },
        }
      } finally {
        this.logs.delete(key)
      }
      return {
        ok: true,
        entry: bundle.entry,
        database: context.database,
        migrations: {
          total: migration.total,
          pending: migration.applied,
          warnings: migration.warnings,
        },
      }
    } finally {
      rmSync(rehearsal, { recursive: true, force: true })
    }
  }

  status(siteId) {
    const databases = this.sites.databases(siteId).map((database) => {
      const path = this.sites.databasePath(siteId, database)
      let migrations = []
      try {
        const db = new Database(path, { readonly: true })
        try {
          migrations = appliedMigrations(db)
        } finally {
          db.close()
        }
      } catch {
        migrations = []
      }
      const worker = this.workers.get(this.key(siteId, database))
      const bytes = ['', '-wal']
        .map((suffix) => `${path}${suffix}`)
        .filter((file) => existsSync(file))
        .reduce((sum, file) => sum + statSync(file).size, 0)
      return {
        name: database,
        sizeBytes: bytes,
        migrations,
        backups: this.listBackups(siteId, database),
        worker: worker
          ? {
              deploymentId: worker.deploymentId,
              startedAt: new Date(worker.startedAt).toISOString(),
              lastUsedAt: new Date(worker.lastUsed).toISOString(),
              inflight: worker.inflight,
            }
          : null,
      }
    })
    this.sites.restoreOwnership(siteId, this.sites.databaseDir(siteId))
    return { siteId, databases }
  }

  recentLogs(siteId, database) {
    const prefix = `${assertSiteId(siteId)}/`
    const entries = []
    for (const [key, lines] of this.logs) {
      if (!key.startsWith(prefix) || key.includes('#')) continue
      const name = key.slice(prefix.length)
      if (database && name !== database) continue
      for (const line of lines) entries.push({ database: name, ...line })
    }
    return entries.sort((left, right) => left.at.localeCompare(right.at))
  }

  async purge(siteId, database) {
    const targets = [...this.workers.values()].filter(
      (worker) =>
        worker.siteId === siteId && (!database || worker.database === database),
    )
    await Promise.all(targets.map((worker) => this.stop(worker)))
    if (database) {
      await this.withLock(this.key(siteId, database), async () => {
        this.sites.removeDatabase(siteId, database)
        rmSync(this.sites.backupDir(siteId, database), {
          recursive: true,
          force: true,
        })
      })
    } else {
      this.sites.removeSite(assertSiteId(siteId))
    }
    for (const key of [...this.logs.keys()]) {
      if (key.startsWith(`${siteId}/${database ?? ''}`)) this.logs.delete(key)
    }
    return { purged: true }
  }

  async restore(siteId, database, backupName) {
    if (
      typeof backupName !== 'string' ||
      !/^[A-Za-z0-9_.-]+\.sqlite$/.test(backupName)
    )
      throw new RuntimeError(400, 'invalid_backup', 'Invalid backup name.')
    const source = join(this.sites.backupDir(siteId, database), backupName)
    if (!existsSync(source))
      throw new RuntimeError(404, 'backup_not_found', 'Backup not found.')
    const key = this.key(siteId, database)
    return this.withLock(key, async () => {
      const worker = this.workers.get(key)
      if (worker) await this.stop(worker, { drainMs: 10_000 })
      this.sites.ensureSite(siteId)
      const target = this.sites.databasePath(siteId, database)
      // Stage the selected backup before retention runs: the safety backup may
      // prune the very backup being restored when the retention limit is full.
      const staged = `${target}.restore-${randomUUID()}`
      let safety
      try {
        copyFileSync(source, staged)
        safety = existsSync(target)
          ? this.backup(siteId, database, 'pre-restore', null)
          : null
        renameSync(staged, target)
        for (const suffix of ['-wal', '-shm'])
          rmSync(`${target}${suffix}`, { force: true })
      } finally {
        rmSync(staged, { force: true })
      }
      this.sites.restoreOwnership(siteId, this.sites.databaseDir(siteId))
      this.log(
        key,
        'stdout',
        `[yeeet] restored ${backupName}${safety ? ` (previous data saved as ${safety})` : ''}`,
      )
      return { restored: backupName, database, safetyBackup: safety }
    })
  }

  reapIdle() {
    const cutoff = Date.now() - this.config.idleTimeoutMs
    for (const worker of this.workers.values()) {
      if (
        !worker.stopping &&
        worker.inflight === 0 &&
        worker.lastUsed < cutoff
      ) {
        this.log(worker.key, 'stdout', '[yeeet] stopping idle worker')
        void this.stop(worker)
      }
    }
  }

  evict() {
    const running = [...this.workers.values()].filter(
      (worker) => !worker.stopping,
    )
    const excess = running.length - this.config.maxWorkers
    if (excess <= 0) return
    running
      .filter((worker) => worker.inflight === 0)
      .sort((left, right) => left.lastUsed - right.lastUsed)
      .slice(0, excess)
      .forEach((worker) => void this.stop(worker))
  }

  enforceMemory() {
    if (process.platform !== 'linux') return
    const limitKb = this.config.maxMemoryMb * 1024
    for (const worker of this.workers.values()) {
      try {
        const status = readFileSync(`/proc/${worker.proc.pid}/status`, 'utf8')
        const rss = Number(/VmRSS:\s+(\d+)/.exec(status)?.[1] ?? 0)
        if (rss > limitKb) {
          this.log(
            worker.key,
            'stderr',
            `[yeeet] worker used ${Math.round(rss / 1024)} MB, above the ${this.config.maxMemoryMb} MB limit; restarting on the next request`,
          )
          void this.stop(worker)
        }
      } catch {
        // The process already exited.
      }
    }
  }
}

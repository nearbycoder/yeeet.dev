import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { signContext } from '../src/auth.js'
import { createRuntime } from '../src/server.js'

const SECRET = 'test-secret-test-secret-test-secret-123'
const siteId = randomUUID()
const otherSiteId = randomUUID()

const TODO_SERVER = `
export default {
  async fetch(request, { db, site }) {
    const url = new URL(request.url)
    if (url.pathname === '/api/todos' && request.method === 'POST') {
      const { title } = await request.json()
      const row = db.query('INSERT INTO todos (title) VALUES (?) RETURNING id, title').get(title)
      return Response.json(row, { status: 201 })
    }
    if (url.pathname === '/api/todos') {
      return Response.json(db.query('SELECT id, title FROM todos ORDER BY id').all())
    }
    if (url.pathname === '/api/site') return Response.json({ site, host: url.host, auth: request.headers.get('authorization'), internal: request.headers.get('x-yeeet-url') })
    if (url.pathname === '/api/boom') throw new Error('kaboom')
    if (url.pathname === '/api/slow') { await Bun.sleep(2000); return new Response('late') }
    if (url.pathname === '/api/spin') { while (true) {} }
    if (url.pathname === '/api/log') { console.log('hello from', site.database); return new Response('logged') }
    return Response.json({ error: 'not found' }, { status: 404 })
  },
}
`

const bundles = new Map()
function addBundle(files, migrations, owner = siteId) {
  const deploymentId = randomUUID()
  bundles.set(deploymentId, {
    deploymentId,
    siteId: owner,
    slug: 'todo',
    entry: '_server.ts',
    files: Object.entries(files).map(([path, content]) => ({ path, content })),
    migrations: Object.entries(migrations).map(([name, sql]) => ({
      name,
      sql,
    })),
  })
  return deploymentId
}

async function fakeControlPlane(url) {
  const id = String(url).split('/').at(-1)
  const bundle = bundles.get(id)
  if (!bundle) return new Response('missing', { status: 404 })
  return Response.json(bundle)
}

let dataDir
let runtime
const config = () => ({
  secret: SECRET,
  controlPlaneUrl: 'http://control.invalid',
  dataDir,
  isolation: false,
  idleTimeoutMs: 60_000,
  maxWorkers: 4,
  maxMemoryMb: 512,
  requestTimeoutMs: 500,
  startTimeoutMs: 5_000,
  backupsToKeep: 3,
  bunPath: process.execPath,
})

function call(op, fields, init = {}) {
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(
    signContext(SECRET, { op, ...fields }),
  ))
    headers.set(name, value)
  const path = fields.url ? new URL(fields.url).pathname : '/'
  return runtime.handle(
    new Request(`http://runtime.internal${path}`, { ...init, headers }),
  )
}

function api(deploymentId, path, init = {}, database = 'live') {
  return call(
    'request',
    {
      siteId,
      slug: 'todo',
      deploymentId,
      database,
      url: `https://todo.site.example.com${path}`,
    },
    init,
  )
}

const MIGRATION_1 =
  'CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL);'
const v1 = addBundle(
  { '_server.ts': TODO_SERVER },
  { '0001_create_todos.sql': MIGRATION_1 },
)

beforeAll(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'yeeet-runtime-'))
  runtime = createRuntime(config(), { fetchImpl: fakeControlPlane })
})

afterAll(async () => {
  await runtime.pool.shutdown()
  rmSync(dataDir, { recursive: true, force: true })
})

describe('signed protocol', () => {
  test('rejects unsigned and tampered requests', async () => {
    const unsigned = await runtime.handle(
      new Request('http://runtime.internal/api/todos'),
    )
    expect(unsigned.status).toBe(401)
    const headers = signContext(SECRET, { op: 'status', siteId })
    headers['x-yeeet-runtime-signature'] = '0'.repeat(64)
    const tampered = await runtime.handle(
      new Request('http://runtime.internal/', { headers }),
    )
    expect(tampered.status).toBe(401)
    const stale = signContext(
      SECRET,
      { op: 'status', siteId },
      Date.now() - 120_000,
    )
    expect(
      (
        await runtime.handle(
          new Request('http://runtime.internal/', { headers: stale }),
        )
      ).status,
    ).toBe(401)
  })

  test('health is public', async () => {
    const response = await runtime.handle(
      new Request('http://runtime.internal/health'),
    )
    expect(response.status).toBe(200)
  })
})

describe('requests', () => {
  test('migrates on first request and keeps state in SQLite', async () => {
    expect(await (await api(v1, '/api/todos')).json()).toEqual([])
    const created = await api(v1, '/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'ship backends' }),
    })
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ id: 1, title: 'ship backends' })
    expect(await (await api(v1, '/api/todos')).json()).toEqual([
      { id: 1, title: 'ship backends' },
    ])
  })

  test('handlers see the public URL and site context, never runtime headers', async () => {
    const body = await (
      await api(v1, '/api/site?x=1', {
        headers: {
          authorization: 'Bearer user-token',
          'x-yeeet-url': 'http://evil',
        },
      })
    ).json()
    expect(body.host).toBe('todo.site.example.com')
    expect(body.auth).toBe('Bearer user-token')
    expect(body.internal).toBeNull()
    expect(body.site).toEqual({
      slug: 'todo',
      deploymentId: v1,
      database: 'live',
    })
  })

  test('thrown errors become 500 JSON and are logged', async () => {
    const response = await api(v1, '/api/boom')
    expect(response.status).toBe(500)
    expect((await response.json()).error.code).toBe('backend_error')
    await Bun.sleep(50)
    const logs = await (await call('logs', { siteId })).json()
    expect(logs.entries.some((entry) => entry.line.includes('kaboom'))).toBe(
      true,
    )
  })

  test('slow handlers time out with 504', async () => {
    const response = await api(v1, '/api/slow')
    expect(response.status).toBe(504)
    expect((await response.json()).error.code).toBe('backend_timeout')
  })

  test('a CPU-bound timeout kills the worker and the next request recovers', async () => {
    const response = await api(v1, '/api/spin')
    expect(response.status).toBe(504)
    expect(runtime.pool.workers.has(`${siteId}/live`)).toBe(false)
    expect(await (await api(v1, '/api/todos')).json()).toEqual([
      { id: 1, title: 'ship backends' },
    ])
  })

  test('channel and version databases are isolated from live', async () => {
    expect(
      await (await api(v1, '/api/todos', {}, 'channel-staging')).json(),
    ).toEqual([])
    expect(
      await (await api(v1, '/api/todos', {}, `version-${v1}`)).json(),
    ).toEqual([])
  })

  test('a deployment for another site is refused', async () => {
    const foreign = addBundle({ '_server.ts': TODO_SERVER }, {}, otherSiteId)
    const response = await api(foreign, '/api/todos')
    expect(response.status).toBe(403)
  })
})

describe('migrations', () => {
  test('a new deployment applies new migrations after a backup', async () => {
    const v2 = addBundle(
      {
        '_server.ts': `import { label } from './_server/label.ts'
export default { fetch: (request, { db }) => Response.json(db.query('SELECT title, done FROM todos').all().map((row) => ({ ...row, label: label(row) }))) }`,
        '_server/label.ts':
          'export const label = (row) => `${row.done ? "✓" : "○"} ${row.title}`',
      },
      {
        '0001_create_todos.sql': MIGRATION_1,
        '0002_add_done.sql':
          'ALTER TABLE todos ADD COLUMN done INTEGER NOT NULL DEFAULT 0;',
      },
    )
    const prepared = await (
      await call('prepare', { siteId, deploymentId: v2, database: 'live' })
    ).json()
    expect(prepared.ok).toBe(true)
    expect(prepared.migrations.pending).toEqual(['0002_add_done.sql'])

    expect(await (await api(v2, '/api/todos')).json()).toEqual([
      { title: 'ship backends', done: 0, label: '○ ship backends' },
    ])
    const status = await (await call('status', { siteId })).json()
    const live = status.databases.find((db) => db.name === 'live')
    expect(live.migrations.map((m) => m.name)).toEqual([
      '0001_create_todos.sql',
      '0002_add_done.sql',
    ])
    expect(live.backups.length).toBe(1)
    expect(live.backups[0].name).toContain('pre-migrate')
    expect(live.worker.deploymentId).toBe(v2)

    // Rolling back keeps the forward-only schema and still serves v1.
    expect(await (await api(v1, '/api/todos')).json()).toEqual([
      { id: 1, title: 'ship backends' },
    ])
  })

  test('prepare rejects an edited migration without touching data', async () => {
    const edited = addBundle(
      { '_server.ts': TODO_SERVER },
      { '0001_create_todos.sql': `${MIGRATION_1}\n-- edited` },
    )
    const prepared = await (
      await call('prepare', { siteId, deploymentId: edited, database: 'live' })
    ).json()
    expect(prepared.ok).toBe(false)
    expect(prepared.error.code).toBe('migration_changed')
    const response = await api(edited, '/api/todos')
    expect(response.status).toBe(503)
    expect((await response.json()).error.code).toBe('migration_changed')
  })

  test('prepare rejects failing SQL and leaves the database unchanged', async () => {
    const broken = addBundle(
      { '_server.ts': TODO_SERVER },
      {
        '0001_create_todos.sql': MIGRATION_1,
        '0002_add_done.sql':
          'ALTER TABLE todos ADD COLUMN done INTEGER NOT NULL DEFAULT 0;',
        '0003_bad.sql':
          'CREATE TABLE ok_table (id INTEGER); ALTER TABLE missing ADD COLUMN x;',
      },
    )
    const prepared = await (
      await call('prepare', { siteId, deploymentId: broken, database: 'live' })
    ).json()
    expect(prepared.ok).toBe(false)
    expect(prepared.error.code).toBe('migration_failed')
    expect(prepared.error.migration).toBe('0003_bad.sql')
    const status = await (await call('status', { siteId })).json()
    const live = status.databases.find((db) => db.name === 'live')
    expect(live.migrations.length).toBe(2)
  })

  test('prepare reports code that fails to boot', async () => {
    const crashing = addBundle(
      { '_server.ts': 'throw new Error("missing config")' },
      { '0001_create_todos.sql': MIGRATION_1 },
    )
    const prepared = await (
      await call('prepare', {
        siteId,
        deploymentId: crashing,
        database: 'live',
      })
    ).json()
    expect(prepared.ok).toBe(false)
    expect(prepared.error.message).toContain('missing config')

    const noHandler = addBundle({ '_server.ts': 'export const nope = 1' }, {})
    const result = await (
      await call('prepare', {
        siteId,
        deploymentId: noHandler,
        database: 'channel-x',
      })
    ).json()
    expect(result.ok).toBe(false)
    expect(result.error.message).toContain('export default')
  })

  test('migration rehearsal enforces the same foreign keys as handlers', async () => {
    const invalid = addBundle(
      { '_server.ts': TODO_SERVER },
      {
        '0001_foreign_key.sql':
          'CREATE TABLE parent (id INTEGER PRIMARY KEY); CREATE TABLE child (parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES (99);',
      },
    )
    const result = await (
      await call('prepare', {
        siteId,
        deploymentId: invalid,
        database: 'channel-foreign-key',
      })
    ).json()
    expect(result.ok).toBe(false)
    expect(result.error.code).toBe('migration_failed')
    expect(result.error.message).toContain('FOREIGN KEY')
  })
})

describe('operations', () => {
  test('restore brings back a backup and keeps a safety copy', async () => {
    const status = await (await call('status', { siteId })).json()
    const backup = status.databases.find((db) => db.name === 'live').backups[0]
    const restored = await (
      await call('restore', { siteId, database: 'live', backup: backup.name })
    ).json()
    expect(restored.restored).toBe(backup.name)
    expect(restored.safetyBackup).toContain('pre-restore')
    const after = await (await call('status', { siteId })).json()
    expect(
      after.databases
        .find((db) => db.name === 'live')
        .migrations.map((m) => m.name),
    ).toEqual(['0001_create_todos.sql'])
  })

  test('restores the oldest retained backup even when the safety backup prunes it', async () => {
    // Several snapshots in one clock tick must also have distinct names.
    const names = Array.from({ length: 4 }, () =>
      runtime.pool.backup(siteId, 'live', 'test'),
    )
    expect(new Set(names).size).toBe(4)
    const before = runtime.pool.listBackups(siteId, 'live')
    expect(before).toHaveLength(3)
    const oldest = before.at(-1).name
    const response = await call('restore', {
      siteId,
      database: 'live',
      backup: oldest,
    })
    expect(response.status).toBe(200)
    expect((await response.json()).restored).toBe(oldest)
    expect(await (await api(v1, '/api/todos')).json()).toEqual([
      { id: 1, title: 'ship backends' },
    ])
  })

  test('idle workers stop and restart on demand', async () => {
    const key = `${siteId}/live`
    expect(await (await api(v1, '/api/log')).text()).toBe('logged')
    const worker = runtime.pool.workers.get(key)
    expect(worker).toBeDefined()
    worker.lastUsed = 0
    runtime.pool.reapIdle()
    await worker.proc.exited
    expect(runtime.pool.workers.has(key)).toBe(false)
    expect((await api(v1, '/api/todos')).status).toBe(200)
    expect(runtime.pool.workers.has(key)).toBe(true)
  })

  test('purge removes a database or the whole site', async () => {
    await (await call('purge', { siteId, database: 'channel-staging' })).json()
    const status = await (await call('status', { siteId })).json()
    expect(status.databases.map((db) => db.name)).not.toContain(
      'channel-staging',
    )
    await (await call('purge', { siteId })).json()
    expect(existsSync(join(dataDir, 'sites', siteId))).toBe(false)
  })
})

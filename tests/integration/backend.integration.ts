// End to end: deploy a site with _server.ts through the real control plane,
// gateway, and Bun runtime. Storage is an in-process S3 stand-in.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'

const bun = process.env.YEEET_BUN || 'bun'
const hasBun = spawnSync(bun, ['--version']).status === 0
const SECRET = 'integration-runtime-secret-integration-runtime'
const objects = new Map<string, Buffer>()
const servers: Array<Server> = []
let runtime: ChildProcess | undefined
let dataDir = ''

function listen(server: Server) {
  servers.push(server)
  return new Promise<number>((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve((server.address() as AddressInfo).port),
    ),
  )
}

async function readBody(request: IncomingMessage) {
  const chunks: Array<Buffer> = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function etag(body: Buffer) {
  return `"${createHash('md5').update(body).digest('hex')}"`
}

/** Just enough path-style S3 for presigned PUTs, head, get, copy, list, and delete. */
function fakeS3() {
  return createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://s3.local')
    const [, , ...keyParts] = url.pathname.split('/')
    const key = keyParts.map(decodeURIComponent).join('/')
    const body = await readBody(request)
    response.setHeader('content-type', 'application/xml')
    if (request.method === 'POST' && url.searchParams.has('delete')) {
      for (const match of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g))
        objects.delete(match[1])
      return response.end('<DeleteResult></DeleteResult>')
    }
    if (request.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? ''
      const keys = [...objects.keys()].filter((name) => name.startsWith(prefix))
      return response.end(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((name) => `<Contents><Key>${name}</Key></Contents>`).join('')}</ListBucketResult>`,
      )
    }
    if (request.method === 'PUT') {
      const source = request.headers['x-amz-copy-source']
      if (typeof source === 'string') {
        const sourceKey = decodeURIComponent(source)
          .replace(/^\/?[^/]+\//, '')
          .split('?')[0]
        const value = objects.get(sourceKey)
        if (!value) {
          response.statusCode = 404
          return response.end('<Error><Code>NoSuchKey</Code></Error>')
        }
        objects.set(key, value)
        return response.end(
          `<CopyObjectResult><ETag>${etag(value)}</ETag><LastModified>${new Date().toISOString()}</LastModified></CopyObjectResult>`,
        )
      }
      objects.set(key, body)
      response.setHeader('etag', etag(body))
      return response.end()
    }
    const value = objects.get(key)
    if (!value) {
      response.statusCode = 404
      return response.end('<Error><Code>NoSuchKey</Code></Error>')
    }
    response.setHeader('content-type', 'application/octet-stream')
    response.setHeader('content-length', String(value.length))
    response.setHeader('etag', etag(value))
    response.end(request.method === 'HEAD' ? undefined : value)
  })
}

const example = (path: string) =>
  readFileSync(join('examples/todo-backend', path), 'utf8')

before(async () => {
  if (!hasBun) return
  const s3Port = await listen(fakeS3())
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
    S3_BUCKET: 'assets',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
    S3_REGION: 'auto',
    S3_FORCE_PATH_STYLE: 'true',
    SITE_DOMAIN: 'site.example.test',
    BACKEND_RUNTIME_SECRET: SECRET,
  })
  const { maybeServeRuntimeBundle } =
    await import('../../src/server/backend-runtime')
  const controlPlanePort = await listen(
    createServer(async (request, response) => {
      const result = await maybeServeRuntimeBundle(
        new Request(`http://control.local${request.url}`, {
          headers: request.headers as Record<string, string>,
        }),
      )
      response.statusCode = result?.status ?? 404
      result?.headers.forEach((value, name) => response.setHeader(name, value))
      response.end(result ? Buffer.from(await result.arrayBuffer()) : undefined)
    }),
  )
  dataDir = mkdtempSync(join(tmpdir(), 'yeeet-runtime-int-'))
  const runtimePort = 20_000 + Math.floor(Math.random() * 20_000)
  runtime = spawn(bun, ['packages/runtime/src/server.js'], {
    env: {
      ...process.env,
      PORT: String(runtimePort),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      CONTROL_PLANE_URL: `http://127.0.0.1:${controlPlanePort}`,
      RUNTIME_ISOLATION: 'off',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  process.env.BACKEND_RUNTIME_URL = `http://127.0.0.1:${runtimePort}`
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      if ((await fetch(`${process.env.BACKEND_RUNTIME_URL}/health`)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('The runtime did not start.')
})

after(async () => {
  runtime?.kill('SIGTERM')
  for (const server of servers) server.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  const { db } = await import('../../src/db')
  await db.$client.end()
})

test(
  'deploys, migrates, serves, rehearses, rolls back, and isolates a site backend',
  { skip: !hasBun && 'Bun is not installed' },
  async () => {
    const { db } = await import('../../src/db')
    const { user, sites } = await import('../../src/db/schema')
    const deploymentsModule = await import('../../src/server/deployments')
    const { maybeServeSite } = await import('../../src/server/site-gateway')
    const { getSiteBackend } = await import('../../src/server/site-backend')
    const owner = randomUUID()
    const slug = `todo-${owner.slice(0, 8)}`
    const actor = { userId: owner } as Parameters<
      typeof deploymentsModule.createDeployment
    >[0]['actor']
    await db
      .insert(user)
      .values({ id: owner, name: 'Backend', email: `${owner}@example.com` })

    async function deploy(
      files: Record<string, string>,
      options: { channel?: string } = {},
    ) {
      const manifest = Object.entries(files).map(([path, content]) => ({
        path,
        size: Buffer.byteLength(content),
        contentType: path.endsWith('.html') ? 'text/html' : 'text/plain',
        checksum: createHash('sha256').update(content).digest('hex'),
      }))
      const created = await deploymentsModule.createDeployment({
        actor,
        slug,
        files: manifest,
        source: 'api',
        channel: options.channel,
      })
      for (const upload of created.uploadUrls) {
        const response = await fetch(upload.url, {
          method: 'PUT',
          headers: upload.headers,
          body: files[upload.path],
        })
        assert.equal(response.status, 200)
      }
      return deploymentsModule.completeDeployment(actor, created.id)
    }

    const site = (path: string, init?: RequestInit, host = slug) =>
      maybeServeSite(
        new Request(`https://${host}.site.example.test${path}`, init),
      ).then((response) => {
        assert.ok(response, `no site response for ${path}`)
        return response
      })
    const post = (title: string, host?: string) =>
      site(
        '/api/todos',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title }),
        },
        host,
      )

    try {
      const v1Files = {
        'index.html': example('index.html'),
        _redirects: '/v1/* /api/:splat 200',
        '_server.ts': example('_server.ts'),
        '_migrations/0001_create_todos.sql': example(
          '_migrations/0001_create_todos.sql',
        ),
      }
      const v1 = await deploy(v1Files)
      assert.equal(v1.backend?.entry, '_server.ts')
      assert.deepEqual(v1.backend.migrations?.pending, [
        '0001_create_todos.sql',
      ])
      const repeated = await deploymentsModule.completeDeployment(actor, v1.id)
      assert.equal(repeated.backend?.entry, '_server.ts')
      assert.equal(repeated.backend.migrations, null)

      // Static files and the backend share one hostname.
      assert.equal((await site('/')).status, 200)
      assert.equal((await site('/_server.ts')).status, 404)
      assert.equal(
        (await site('/_migrations/0001_create_todos.sql')).status,
        404,
      )
      assert.equal((await site('/', { method: 'POST' })).status, 405)
      assert.equal((await post('first')).status, 201)
      const rewritten = await site('/v1/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'rewritten' }),
      })
      assert.equal(rewritten.status, 201)
      const rewrittenTodo = await rewritten.json()
      assert.equal(
        (await site(`/api/todos/${rewrittenTodo.id}`, { method: 'DELETE' }))
          .status,
        204,
      )
      const listed = await site('/api/todos')
      assert.equal(
        listed.headers.get('cache-control'),
        'private, no-store, max-age=0',
      )
      assert.deepEqual(
        ((await listed.json()) as Array<{ title: string }>).map((t) => t.title),
        ['first'],
      )

      // A failing migration is caught before the live pointer moves.
      await assert.rejects(
        deploy({
          ...v1Files,
          '_migrations/0002_broken.sql': 'ALTER TABLE missing ADD COLUMN x;',
        }),
        (error: { status: number; code: string; message: string }) =>
          error.status === 422 &&
          error.code === 'migration_failed' &&
          error.message.includes('0002_broken.sql'),
      )
      const liveSite = await db.query.sites.findFirst({
        where: eq(sites.slug, slug),
      })
      assert.equal(liveSite?.activeDeploymentId, v1.id)
      assert.equal((await (await site('/api/todos')).json()).length, 1)

      // An edited, already-applied migration is rejected too.
      await assert.rejects(
        deploy({
          ...v1Files,
          '_migrations/0001_create_todos.sql': `${v1Files['_migrations/0001_create_todos.sql']}\n-- edited`,
        }),
        { code: 'migration_changed' },
      )

      // A good migration ships, backs up first, and keeps data.
      const v2 = await deploy({
        ...v1Files,
        '_migrations/0002_priority.sql':
          'ALTER TABLE todos ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;',
      })
      assert.deepEqual(v2.backend?.migrations?.pending, ['0002_priority.sql'])
      const afterV2 = (await (await site('/api/todos')).json()) as Array<{
        title: string
        priority: number
      }>
      assert.deepEqual(
        afterV2.map(({ title, priority }) => ({ title, priority })),
        [{ title: 'first', priority: 0 }],
      )
      const status = await getSiteBackend(owner, slug)
      const live = status.databases.find(
        (database: { name: string }) => database.name === 'live',
      )
      assert.deepEqual(
        live?.migrations.map((migration: { name: string }) => migration.name),
        ['0001_create_todos.sql', '0002_priority.sql'],
      )
      assert.equal(live.backups.length, 1)

      // Rolling back keeps the forward-only schema and still serves data.
      await deploymentsModule.activateSiteVersion(owner, slug, v1.id)
      assert.equal((await (await site('/api/todos')).json()).length, 1)

      // Channels and immutable version URLs have their own databases.
      const staging = await deploy(v1Files, { channel: 'staging' })
      assert.equal(staging.backend?.database, 'channel-staging')
      assert.deepEqual(
        await (await site('/api/todos', undefined, `${slug}--staging`)).json(),
        [],
      )
      const versionHost = `v-${v2.id.replaceAll('-', '')}`
      assert.deepEqual(
        await (await site('/api/todos', undefined, versionHost)).json(),
        [],
      )
      assert.equal((await site('/api/todos')).status, 200)
    } finally {
      await deploymentsModule.deleteOwnedSite(owner, slug).catch(() => {})
      await db.delete(user).where(eq(user.id, owner))
    }
    assert.equal(
      spawnSync('ls', [join(dataDir, 'sites')], {
        encoding: 'utf8',
      }).stdout.trim(),
      '',
    )
  },
)

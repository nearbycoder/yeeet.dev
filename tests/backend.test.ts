import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import {
  describeBackend,
  isBackendRoute,
  isPrivateBackendPath,
} from '../src/lib/backend-layout'
import { signContext, verifyContext } from '../packages/runtime/src/auth.js'
import {
  backendDatabase,
  backendFromManifest,
  proxyBackendRequest,
} from '../src/server/backend-runtime'
import { simulateRoute } from '../src/server/route-simulator'

const SECRET = 'a-very-long-shared-runtime-secret-value'

test('the CLI ships byte-identical copies of the shared runtime modules', () => {
  for (const file of ['backend-layout.js', 'migrations.js', 'harness.js']) {
    assert.equal(
      readFileSync(`packages/cli/runtime/${file}`, 'utf8'),
      readFileSync(`packages/runtime/src/${file}`, 'utf8'),
      `packages/cli/runtime/${file} drifted from packages/runtime/src/${file}`,
    )
  }
})

test('static deployments have no backend', () => {
  assert.equal(
    describeBackend([
      { path: 'index.html', size: 10 },
      { path: 'api/data.json', size: 10 },
    ]),
    null,
  )
})

test('describes the entry, sources, and numerically ordered migrations', () => {
  const backend = describeBackend([
    { path: 'index.html', size: 10 },
    { path: '_server.ts', size: 100 },
    { path: '_server/db.ts', size: 50 },
    { path: '_migrations/10_later.sql', size: 5 },
    { path: '_migrations/2_second.sql', size: 5 },
    { path: '_migrations/0001_first.sql', size: 5 },
    { path: '_migrations/README.md', size: 5 },
  ])
  assert.deepEqual(backend, {
    entry: '_server.ts',
    files: ['_server.ts', '_server/db.ts'],
    migrations: [
      { name: '0001_first.sql', path: '_migrations/0001_first.sql' },
      { name: '2_second.sql', path: '_migrations/2_second.sql' },
      { name: '10_later.sql', path: '_migrations/10_later.sql' },
    ],
    bytes: 150,
  })
})

test('rejects ambiguous or incomplete backends', () => {
  assert.throws(
    () =>
      describeBackend([
        { path: '_server.ts', size: 1 },
        { path: '_server.js', size: 1 },
      ]),
    { code: 'backend_entry_conflict' },
  )
  assert.throws(
    () => describeBackend([{ path: '_migrations/0001_a.sql', size: 1 }]),
    { code: 'backend_entry_missing' },
  )
  assert.throws(
    () =>
      describeBackend([
        { path: '_server.ts', size: 1 },
        { path: '_migrations/create.sql', size: 1 },
      ]),
    { code: 'invalid_migration_name' },
  )
  assert.throws(
    () =>
      describeBackend([
        { path: '_server.ts', size: 1 },
        { path: '_migrations/old/0001_a.sql', size: 1 },
      ]),
    { code: 'invalid_migration_name' },
  )
  assert.throws(
    () => describeBackend([{ path: '_server.ts', size: 6 * 1024 * 1024 }]),
    { code: 'backend_too_large' },
  )
})

test('backend source is private and /api routes go to the backend', () => {
  for (const path of [
    '_server.ts',
    '/_server.js',
    '_server/db.ts',
    '_migrations/0001_a.sql',
  ])
    assert.equal(isPrivateBackendPath(path), true, path)
  for (const path of ['server.ts', 'docs/_server.ts', '_next/static/app.js'])
    assert.equal(isPrivateBackendPath(path), false, path)
  assert.equal(isBackendRoute('/api'), true)
  assert.equal(isBackendRoute('/api/todos/1'), true)
  assert.equal(isBackendRoute('/apis'), false)
  assert.equal(isBackendRoute('/docs/api'), false)
})

test('each hostname kind gets its own database', () => {
  assert.equal(backendDatabase({ kind: 'live' }), 'live')
  assert.equal(backendDatabase({ kind: 'custom' }), 'live')
  assert.equal(
    backendDatabase({ kind: 'channel', channel: 'staging' }),
    'channel-staging',
  )
  assert.equal(
    backendDatabase({ kind: 'version', deploymentId: 'abc' }),
    'version-abc',
  )
})

test('signed runtime context round-trips and rejects tampering or staleness', () => {
  const headers = new Headers(
    signContext(SECRET, { op: 'status', siteId: 'x' }),
  )
  assert.equal(verifyContext(SECRET, headers)?.op, 'status')
  assert.equal(verifyContext('another-secret-another-secret-12', headers), null)
  const stale = new Headers(
    signContext(SECRET, { op: 'status' }, Date.now() - 5 * 60_000),
  )
  assert.equal(verifyContext(SECRET, stale), null)
})

test('deployments with a backend require a configured runtime', () => {
  const files = [{ path: '_server.ts', size: 10 }]
  const previous = { ...process.env }
  try {
    delete process.env.BACKEND_RUNTIME_URL
    assert.throws(() => backendFromManifest(files), {
      code: 'backend_runtime_unavailable',
    })
    process.env.BACKEND_RUNTIME_URL = 'http://runtime.internal'
    process.env.BACKEND_RUNTIME_SECRET = SECRET
    assert.equal(backendFromManifest(files)?.entry, '_server.ts')
    assert.equal(backendFromManifest([{ path: 'a.html', size: 1 }]), null)
  } finally {
    process.env = previous
  }
})

test('route simulation hides backend source and routes /api to the backend', () => {
  const version = {
    files: [
      { path: 'index.html' },
      { path: '_server.ts' },
      { path: '_server/index.html' },
    ],
    spaFallback: false,
    headerRules: '[]',
    redirectRules: JSON.stringify([
      { from: '/v1/*', to: '/api/:splat', status: 200 },
    ]),
    backend: JSON.stringify({ entry: '_server.ts' }),
  }
  assert.equal(simulateRoute(version, '/api/todos').backend, true)
  assert.equal(simulateRoute(version, '/v1/todos').backend, true)
  assert.equal(simulateRoute(version, '/_server.ts').file, null)
  assert.equal(simulateRoute(version, '/_server/').file, null)
  assert.equal(
    simulateRoute({ ...version, backend: null }, '/api/todos').backend,
    false,
  )
})

test('the gateway signs, filters, and applies response policy to backend requests', async () => {
  let seen: {
    method?: string
    url?: string
    headers: Record<string, string | Array<string> | undefined>
    body: string
  } = { headers: {}, body: '' }
  const runtime = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      seen = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      }
      response.setHeader('content-type', 'application/json')
      response.setHeader('set-cookie', ['a=1; Path=/', 'b=2; Path=/'])
      response.end('{"ok":true}')
    })
  })
  await new Promise<void>((resolve) => runtime.listen(0, '127.0.0.1', resolve))
  const previous = { ...process.env }
  process.env.BACKEND_RUNTIME_URL = `http://127.0.0.1:${(runtime.address() as AddressInfo).port}`
  process.env.BACKEND_RUNTIME_SECRET = SECRET
  try {
    const deploymentId = '11111111-2222-4333-8444-555555555555'
    const response = await proxyBackendRequest({
      request: new Request('https://todo.site.example.com/api/todos?x=1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `session=abc; yeeet_share_${deploymentId.replaceAll('-', '')}=secret`,
          'x-yeeet-runtime-context': 'forged',
        },
        body: '{"title":"hi"}',
      }),
      publicUrl: new URL('https://todo.site.example.com/api/todos?x=1'),
      siteId: '99999999-2222-4333-8444-555555555555',
      slug: 'todo',
      deploymentId,
      database: 'live',
      protectedDeployment: false,
      noCrawl: true,
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(
      response.headers.get('cache-control'),
      'private, no-store, max-age=0',
    )
    assert.equal(response.headers.get('x-yeeet-deployment'), deploymentId)
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/)
    assert.deepEqual(response.headers.getSetCookie(), [
      'a=1; Path=/',
      'b=2; Path=/',
    ])

    assert.equal(seen.method, 'POST')
    assert.equal(seen.url, '/api/todos?x=1')
    assert.equal(seen.body, '{"title":"hi"}')
    assert.equal(seen.headers.cookie, 'session=abc')
    const context = verifyContext(
      SECRET,
      new Headers(seen.headers as Record<string, string>),
    ) as Record<string, string>
    assert.equal(context.op, 'request')
    assert.equal(context.database, 'live')
    assert.equal(context.url, 'https://todo.site.example.com/api/todos?x=1')
    assert.equal(seen.headers['x-forwarded-host'], 'todo.site.example.com')
  } finally {
    process.env = previous
    runtime.close()
  }
})

test('the gateway reports an unreachable runtime without leaking details', async () => {
  const previous = { ...process.env }
  process.env.BACKEND_RUNTIME_URL = 'http://127.0.0.1:9'
  process.env.BACKEND_RUNTIME_SECRET = SECRET
  try {
    const response = await proxyBackendRequest({
      request: new Request('https://todo.site.example.com/api/todos'),
      publicUrl: new URL('https://todo.site.example.com/api/todos'),
      siteId: '99999999-2222-4333-8444-555555555555',
      slug: 'todo',
      deploymentId: '11111111-2222-4333-8444-555555555555',
      database: 'live',
      protectedDeployment: false,
      noCrawl: false,
    })
    assert.equal(response.status, 502)
    assert.equal((await response.json()).error.code, 'backend_unavailable')
  } finally {
    process.env = previous
  }
})

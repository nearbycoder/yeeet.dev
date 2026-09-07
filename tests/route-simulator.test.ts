import assert from 'node:assert/strict'
import test from 'node:test'
import {
  simulateRoute,
  simulateOwnedRoute,
} from '../src/server/route-simulator'
import { candidatePaths } from '../src/lib/route-resolution'
import { db } from '../src/db'

const version = {
  files: [
    { path: 'index.html' },
    { path: 'docs/index.html' },
    { path: '404.html' },
  ],
  spaFallback: true,
  headerRules: JSON.stringify([
    { path: '/docs', headers: [{ name: 'x-test', value: 'yes' }] },
  ]),
  redirectRules: JSON.stringify([
    { from: '/old', to: '/docs', status: 200 },
    { from: '/away', to: 'https://example.com', status: 302 },
  ]),
}
test('route simulation uses gateway resolution for indexes, rewrites, SPA and custom 404', () => {
  assert.deepEqual(candidatePaths('/docs'), [
    'docs',
    'docs.html',
    'docs/index.html',
  ])
  assert.equal(simulateRoute(version, '/docs?x=1').file, 'docs/index.html')
  const rewrite = simulateRoute(version, '/old')
  assert.equal(rewrite.effectivePath, '/docs')
  assert.equal(rewrite.headers[0].value, 'yes')
  assert.equal(simulateRoute(version, '/client-route').spa, true)
  const asset = simulateRoute(version, '/missing.js')
  assert.equal(asset.status, 404)
  assert.equal(asset.file, '404.html')
  assert.equal(simulateRoute(version, '/_headers').file, null)
  assert.deepEqual(candidatePaths('/%2e%2e/secret'), [])
  const redirect = simulateRoute(version, '/away')
  assert.equal(redirect.status, 302)
  assert.equal(redirect.redirect?.to, 'https://example.com')
  assert.equal(redirect.file, null)
})
test('simulation validates paths and requires ownership before loading a manifest', async (t) => {
  await assert.rejects(
    simulateOwnedRoute('owner', {
      slug: 'site',
      version: '12345678',
      path: 'https://external.test',
    }),
  )
  t.mock.method(db.query.sites, 'findFirst', async () => undefined)
  await assert.rejects(
    simulateOwnedRoute('other', {
      slug: 'site',
      version: '12345678',
      path: '/',
    }),
    /Site not found/,
  )
})

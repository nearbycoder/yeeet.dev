import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { healthSchema, previewHasExpired } from '../src/lib/lifecycle'
import { setPreviewExpiry } from '../src/server/lifecycle'
import { siteResponsePolicy } from '../src/server/site-gateway'

test('expiry blocks only previews and leaves production available', () => {
  assert.equal(
    previewHasExpired('2026-01-01', false, Date.parse('2026-02-01')),
    true,
  )
  assert.equal(
    previewHasExpired('2026-01-01', true, Date.parse('2026-02-01')),
    false,
  )
  assert.equal(previewHasExpired(null, false), false)
  assert.equal(
    previewHasExpired('2026-03-01', false, Date.parse('2026-02-01')),
    false,
  )
  assert.match(
    siteResponsePolicy('text/html', true, false, true, true).cacheControl,
    /no-store/,
  )
  assert.match(
    siteResponsePolicy('text/html', false, false, true, true).cacheControl,
    /no-store/,
  )
})
test('health checks accept only bounded local paths and HTTP statuses', () => {
  const input = { slug: 'comet', enabled: true, path: '/', expectedStatus: 200 }
  assert.equal(healthSchema.parse(input).path, '/')
  assert.throws(() => healthSchema.parse({ ...input, path: '//example.com' }))
  assert.throws(() => healthSchema.parse({ ...input, expectedStatus: 999 }))
})
test('expiry cannot be applied to production or another owner’s site', async (t) => {
  let site: { activeDeploymentId: string } | undefined = undefined
  t.mock.method(db.query.sites, 'findFirst', async () => site)
  await assert.rejects(
    setPreviewExpiry('outsider', { slug: 'comet', version: 'v1', hours: 24 }),
    /Site not found/,
  )
  site = { activeDeploymentId: 'v1' }
  await assert.rejects(
    setPreviewExpiry('owner', { slug: 'comet', version: 'v1', hours: 24 }),
    /Production cannot expire/,
  )
})

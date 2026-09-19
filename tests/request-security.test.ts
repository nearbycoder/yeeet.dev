import assert from 'node:assert/strict'
import test from 'node:test'
import {
  initialUserRole,
  requireTrustedMutation,
} from '../src/server/request-security'
import { controlPlaneUrl } from '../src/server/platform-config'
import { safeDeploymentReturnTo } from '../src/server/deployment-access'
import {
  isPrivateWebhookAddress,
  normalizeWebhookUrl,
} from '../src/server/webhooks'

const request = (headers: Record<string, string>, method = 'POST') =>
  new Request(`${controlPlaneUrl()}/api/v1/deployments`, { method, headers })
test('console writes require the exact trusted origin while CLI writes remain available', () => {
  assert.doesNotThrow(() =>
    requireTrustedMutation(
      request({ origin: controlPlaneUrl(), cookie: 'session=fixture' }),
    ),
  )
  assert.doesNotThrow(() =>
    requireTrustedMutation(request({ authorization: 'Bearer fixture' })),
  )
  assert.doesNotThrow(() =>
    requireTrustedMutation(request({ 'x-api-key': 'fixture' })),
  )
  assert.doesNotThrow(() => requireTrustedMutation(request({}, 'GET')))
  for (const origin of [
    'https://example.com',
    'https://tenant.site.yeeet.dev',
    'null',
    `${controlPlaneUrl()}.example.com`,
  ]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.throws(
        () =>
          requireTrustedMutation(
            request({ origin, cookie: 'session=fixture' }, method),
          ),
        /console/,
      )
    }
  }
  assert.throws(
    () => requireTrustedMutation(request({ cookie: 'session=fixture' })),
    /origin/,
  )
  assert.throws(
    () =>
      requireTrustedMutation(
        request({ cookie: 'session=fixture', authorization: 'Bearer fixture' }),
      ),
    /origin/,
  )
  for (const site of ['same-site', 'cross-site'])
    assert.throws(
      () => requireTrustedMutation(request({ 'sec-fetch-site': site })),
      /console/,
    )
})
test('bootstrap roles require both a verified email and an explicit allowlist entry', () => {
  const allowed = new Set(['admin@example.com'])
  assert.equal(initialUserRole('admin@example.com', false, allowed), 'user')
  assert.equal(initialUserRole('ADMIN@example.com', true, allowed), 'admin')
  assert.equal(initialUserRole('other@example.com', true, allowed), 'user')
})
test('private deployment redirects stay local for browser URL parsing', () => {
  for (const value of [
    '//example.com',
    '/\\example.com',
    '/\n/example.com',
    '\\example.com',
    'https://example.com',
    '',
    null,
  ])
    assert.equal(safeDeploymentReturnTo(value), '/')
  for (const value of ['/', '/docs/page?tab=one#top', '/index.html'])
    assert.equal(safeDeploymentReturnTo(value), value)
})
test('webhook address checks cover equivalent IP notations and non-public ranges', async () => {
  for (const value of [
    '::ffff:7f00:1',
    '::ffff:127.0.0.1',
    '0:0:0:0:0:0:0:1',
    '[::ffff:a00:1]',
    '::ffff:c0a8:1',
    '::ffff:a9fe:a9fe',
    '::',
    'ff02::1',
    'fe80::1',
    'fc00::1',
    '100.64.0.1',
    '198.18.0.1',
    '240.0.0.1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
  ])
    assert.equal(isPrivateWebhookAddress(value), true, value)
  for (const value of [
    '8.8.8.8',
    '1.1.1.1',
    '2606:4700:4700::1111',
    '::ffff:808:808',
  ])
    assert.equal(isPrivateWebhookAddress(value), false, value)
  for (const value of [
    'https://[::ffff:7f00:1]/hook',
    'https://[0:0:0:0:0:0:0:1]/hook',
    'https://2130706433/hook',
  ])
    await assert.rejects(normalizeWebhookUrl(value), /private or loopback/)
})

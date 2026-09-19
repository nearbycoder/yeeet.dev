import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

const origin = new URL(process.argv[2] || 'http://localhost:3000')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
assert.ok(process.env.YEEET_TEST_EMAIL && process.env.YEEET_TEST_PASSWORD)
const call = (path, options = {}) =>
  fetch(new URL(path, origin), { redirect: 'manual', ...options })
const post = (path, body, headers = {}) =>
  call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
assert.equal((await call('/api/v1/me')).status, 401)
const login = await post(
  '/api/auth/sign-in/email',
  {
    email: process.env.YEEET_TEST_EMAIL,
    password: process.env.YEEET_TEST_PASSWORD,
  },
  { origin: origin.origin },
)
assert.equal(login.status, 200)
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ')
assert.ok(cookie)
const trusted = { cookie, origin: origin.origin }
const plan = { dryRun: true, files: [{ path: 'index.html', size: 1 }] }
let key
try {
  assert.equal((await call('/api/v1/me', { headers: { cookie } })).status, 200)
  for (const headers of [
    { cookie },
    { cookie, origin: 'https://tenant.site.example.com' },
    { cookie, origin: 'null' },
  ]) {
    assert.equal((await post('/api/v1/deployments', plan, headers)).status, 403)
    assert.equal(
      (
        await post(
          '/api/auth/update-user',
          { name: 'Untrusted change' },
          headers,
        )
      ).status,
      403,
    )
    assert.equal((await post('/_serverFn/unknown', {}, headers)).status, 403)
  }
  assert.equal((await post('/api/v1/deployments', plan, trusted)).status, 200)
  assert.equal(
    (await call('/api/v1/admin', { headers: { cookie } })).status,
    403,
  )
  const deviceResponse = await post('/api/auth/device/code', {
    client_id: 'yeeet-cli',
    scope: 'openid profile email',
  })
  assert.equal(deviceResponse.status, 200)
  const device = await deviceResponse.json()
  assert.ok(device.user_code && device.device_code)
  assert.equal(
    (
      await call(
        `/api/auth/device?user_code=${encodeURIComponent(device.user_code)}`,
        { headers: trusted },
      )
    ).status,
    200,
  )
  assert.equal(
    (
      await post(
        '/api/auth/device/approve',
        { userCode: device.user_code },
        trusted,
      )
    ).status,
    200,
  )
  const issued = await post('/api/auth/device/token', {
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: device.device_code,
    client_id: 'yeeet-cli',
  })
  assert.equal(issued.status, 200)
  const deviceToken = (await issued.json()).access_token
  assert.ok(deviceToken)
  const deviceHeaders = { authorization: `Bearer ${deviceToken}` }
  assert.equal(
    (await call('/api/v1/me', { headers: deviceHeaders })).status,
    200,
  )
  assert.equal(
    (await post('/api/v1/deployments', plan, deviceHeaders)).status,
    200,
  )
  assert.equal(
    (
      await post(
        '/api/auth/sign-out',
        {},
        { ...deviceHeaders, origin: origin.origin },
      )
    ).status,
    200,
  )
  const created = await post(
    '/api/auth/api-key/create',
    { name: 'Local security regression', expiresIn: 86400 },
    trusted,
  )
  assert.equal(created.status, 200)
  key = await created.json()
  assert.ok(key.key && key.id)
  const tokenHeaders = { authorization: `Bearer ${key.key}` }
  assert.equal(
    (await call('/api/v1/me', { headers: tokenHeaders })).status,
    200,
  )
  assert.equal(
    (await post('/api/v1/deployments', plan, tokenHeaders)).status,
    200,
  )
  const cli = JSON.parse(
    execFileSync(
      process.execPath,
      ['packages/cli/bin/yeeet.js', 'whoami', '--json'],
      {
        encoding: 'utf8',
        env: { ...process.env, YEEET_API: origin.origin, YEEET_TOKEN: key.key },
      },
    ),
  )
  assert.ok(cli)
  assert.equal(
    (await post('/api/auth/api-key/delete', { keyId: key.id }, trusted)).status,
    200,
  )
  assert.equal(
    (await call('/api/v1/me', { headers: tokenHeaders })).status,
    401,
  )
  key = undefined
  console.log(
    'Security HTTP checks passed: authentication, origin enforcement, admin isolation, API key creation/revocation, device authorization, and CLI access.',
  )
} finally {
  if (key?.id)
    await post('/api/auth/api-key/delete', { keyId: key.id }, trusted)
  await post('/api/auth/sign-out', {}, trusted)
}

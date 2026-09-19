import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import process from 'node:process'
const origin = new URL(process.argv[2] || 'http://localhost:3000')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
assert.ok(process.env.YEEET_TEST_EMAIL && process.env.YEEET_TEST_PASSWORD)
const call = (path, options = {}) => fetch(new URL(path, origin), options)
const post = (path, body, headers = {}) =>
  call(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
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
  .map((v) => v.split(';')[0])
  .join('; ')
const trusted = { cookie, origin: origin.origin }
let key
try {
  const created = await post(
    '/api/auth/api-key/create',
    { name: 'Local CLI feature check', expiresIn: 86400 },
    trusted,
  )
  assert.equal(created.status, 200)
  key = await created.json()
  assert.ok(key.key && key.id)
  const list = await call('/api/v1/sites', { headers: { cookie } })
  const site = (await list.json()).sites.find(
    (s) => s.activeDeploymentId && !s.protected,
  )
  assert.ok(site, 'Requires a local public deployment fixture')
  const cli = (...args) =>
    execFileSync(process.execPath, ['packages/cli/bin/yeeet.js', ...args], {
      encoding: 'utf8',
      env: { ...process.env, YEEET_API: origin.origin, YEEET_TOKEN: key.key },
    })
  const live = JSON.parse(cli('open', site.slug, '--json'))
  assert.equal(live.url, new URL(site.url).href)
  const version = JSON.parse(
    cli('open', site.slug, site.activeDeploymentId.slice(0, 8), '--json'),
  )
  assert.equal(version.version, site.activeDeploymentId)
  assert.ok(
    new URL(version.url).hostname.startsWith(
      `v-${site.activeDeploymentId.replaceAll('-', '')}.`,
    ),
  )
  assert.equal(new URL(version.url).search, '')
  const path = `/api/v1/sites/${site.slug}/versions/${site.activeDeploymentId}`
  assert.equal((await call(path)).status, 401)
  const metadata = await (await call(path, { headers: { cookie } })).json()
  assert.equal('shareUrl' in metadata.version, false)
  assert.equal(
    (
      await call(
        `/api/v1/sites/missing-cli-site/versions/${site.activeDeploymentId}`,
        { headers: { cookie } },
      )
    ).status,
    404,
  )
  const filtered = JSON.parse(
    cli(
      'versions',
      site.slug,
      '--search',
      site.activeDeploymentId.slice(0, 8),
      '--status',
      'ready',
      '--json',
    ),
  )
  assert.equal(filtered.versions.length, 1)
  assert.equal(filtered.versions[0].id, site.activeDeploymentId)
  const empty = JSON.parse(
    cli(
      'versions',
      site.slug,
      '--search',
      'no-such-cli-release-fixture',
      '--json',
    ),
  )
  assert.equal(empty.versions.length, 0)
  assert.equal(empty.nextCursor, null)
  console.log(
    'CLI open and version search resolve owned deployments through authenticated local APIs.',
  )
} finally {
  if (key?.id)
    await post('/api/auth/api-key/delete', { keyId: key.id }, trusted)
  await post('/api/auth/sign-out', {}, trusted)
}

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  generateRandomSlug,
  normalizeFilePath,
  normalizeSlug,
  versionUrl,
} from '../src/server/deployments'
import { normalizeCustomDomain } from '../src/server/custom-domains'
import {
  generateShareNonce,
  hashDeploymentPassword,
  shareTokenForDeployment,
  verifyDeploymentPassword,
  verifyDeploymentShareToken,
} from '../src/server/deployment-access'
import { hashInvitationCode } from '../src/server/invitations'
import { maybeServeDocs } from '../src/server/docs-site'
import { getYeeetlingDesign } from '../src/components/yeeetling'
import {
  shouldUseSpaFallback,
  siteResponsePolicy,
} from '../src/server/site-gateway'

async function withEnvironment<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>,
) {
  const originals = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  )
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return await run()
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('normalizes valid site slugs', () => {
  assert.equal(normalizeSlug('  Comet-Docs '), 'comet-docs')
  assert.equal(normalizeSlug('a'), 'a')
})

test('rejects unsafe or invalid site slugs', () => {
  for (const slug of ['-bad', 'bad-', 'bad--name', 'UP PER', '']) {
    assert.throws(() => normalizeSlug(slug))
  }
})

test('normalizes platform-independent file paths', () => {
  assert.equal(normalizeFilePath('/assets\\app.js'), 'assets/app.js')
  assert.equal(normalizeFilePath('./index.html'), 'index.html')
})

test('rejects traversal and empty file paths', () => {
  assert.throws(() => normalizeFilePath('../secret'))
  assert.throws(() => normalizeFilePath('/'))
})

test('builds immutable version URLs from the configured site domain', async () => {
  await withEnvironment({ SITE_DOMAIN: 'sites.example.com' }, () => {
    assert.equal(
      versionUrl('52eabb5f-36c8-4246-8422-893db39607d3'),
      'https://v-52eabb5f36c842468422893db39607d3.sites.example.com',
    )
  })
})

test('hashes normalized invitation codes without storing plaintext', () => {
  assert.equal(
    hashInvitationCode('  invite_example  '),
    '56c2c6bb21faeed949f91c9b0edb77c3537205bbbe5d755ba5bd7897cff481e9',
  )
  assert.equal(
    hashInvitationCode('invite_example'),
    hashInvitationCode('  invite_example  '),
  )
})

test('generates valid readable random site names', () => {
  const first = generateRandomSlug()
  assert.match(first, /^[a-z]+-[a-z]+-[a-f0-9]{6}$/)
})

test('generates stable Yeeetlings with thousands of distinct designs', () => {
  assert.deepEqual(getYeeetlingDesign('comet'), getYeeetlingDesign('comet'))
  assert.notDeepEqual(
    getYeeetlingDesign('comet'),
    getYeeetlingDesign('satellite'),
  )

  const designs = new Set(
    Array.from({ length: 5000 }, (_, index) =>
      JSON.stringify(getYeeetlingDesign(`site-${index}`)),
    ),
  )
  assert.ok(designs.size > 4000)
})

test('normalizes custom hostnames and rejects URLs or reserved hosts', () => {
  assert.equal(normalizeCustomDomain('Docs.Example.com.'), 'docs.example.com')
  assert.throws(() => normalizeCustomDomain('https://docs.example.com'))
  assert.throws(() => normalizeCustomDomain('demo.site.yeeet.dev'))
})

test('uses SPA fallback for navigations but not missing assets or static mode', () => {
  assert.equal(
    shouldUseSpaFallback(
      new Request('https://demo.site.yeeet.dev/settings/profile', {
        headers: { accept: 'text/html,application/xhtml+xml' },
      }),
      true,
    ),
    true,
  )
  assert.equal(
    shouldUseSpaFallback(
      new Request('https://demo.site.yeeet.dev/assets/missing.js', {
        headers: { accept: 'text/html' },
      }),
      true,
    ),
    false,
  )
  assert.equal(
    shouldUseSpaFallback(
      new Request('https://demo.site.yeeet.dev/settings'),
      false,
    ),
    false,
  )
})

test('keeps immutable versions out of crawler indexes and archives', () => {
  const policy = siteResponsePolicy('text/html', true, false)
  assert.equal(policy.cacheControl, 'public, max-age=31536000, immutable')
  assert.equal(
    policy.xRobotsTag,
    'noindex, nofollow, noarchive, nosnippet, noimageindex',
  )
})

test('prevents private deployments from being stored or crawled', () => {
  const policy = siteResponsePolicy('text/javascript', true, true)
  assert.equal(policy.cacheControl, 'private, no-store, max-age=0')
  assert.match(policy.xRobotsTag ?? '', /noindex/)
  assert.match(policy.xRobotsTag ?? '', /noarchive/)
})

test('hashes deployment passwords and validates signed share tokens', async () => {
  const passwordHash = await hashDeploymentPassword('correct-horse-battery')
  assert.equal(
    await verifyDeploymentPassword('correct-horse-battery', passwordHash),
    true,
  )
  assert.equal(
    await verifyDeploymentPassword('wrong-password', passwordHash),
    false,
  )

  const original = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET = 'test-only-private-share-secret'
  const deploymentId = '52eabb5f-36c8-4246-8422-893db39607d3'
  const nonce = generateShareNonce()
  const token = shareTokenForDeployment(deploymentId, nonce)
  assert.equal(verifyDeploymentShareToken(token, deploymentId, nonce), true)
  assert.equal(
    verifyDeploymentShareToken(`${token}x`, deploymentId, nonce),
    false,
  )
  if (original === undefined) delete process.env.BETTER_AUTH_SECRET
  else process.env.BETTER_AUTH_SECRET = original
})

test('serves configured human and machine-readable docs', async () => {
  await withEnvironment(
    {
      BETTER_AUTH_URL: 'https://deploy.example.com',
      DOCS_HOST: 'docs.example.com',
      SITE_DOMAIN: 'sites.example.com',
    },
    async () => {
      const home = maybeServeDocs(new Request('https://docs.example.com/'))
      assert.ok(home)
      assert.equal(home.status, 200)
      assert.match(home.headers.get('content-type') ?? '', /^text\/html/)
      const html = await home.text()
      assert.match(html, /From folder to <span>HTTPS<\/span>/)
      assert.match(html, /https:\/\/deploy\.example\.com\/dashboard/)
      assert.match(html, /sites\.example\.com/)

      const llms = maybeServeDocs(
        new Request('https://docs.example.com/llms.txt'),
      )
      assert.ok(llms)
      assert.match(llms.headers.get('content-type') ?? '', /^text\/plain/)
      assert.match(await llms.text(), /yeeet deploy \.\/dist --json/)

      const openapi = maybeServeDocs(
        new Request('https://docs.example.com/openapi.json'),
      )
      assert.ok(openapi)
      assert.equal(openapi.status, 307)
      assert.equal(
        openapi.headers.get('location'),
        'https://deploy.example.com/openapi.json',
      )

      assert.equal(maybeServeDocs(new Request('https://docs.yeeet.dev/')), null)
    },
  )
})

test('docs host handles HEAD, unsupported methods, and unknown paths', async () => {
  await withEnvironment({ DOCS_HOST: 'docs.example.com' }, async () => {
    const head = maybeServeDocs(
      new Request('https://docs.example.com/llms-full.txt', { method: 'HEAD' }),
    )
    assert.ok(head)
    assert.equal(await head.text(), '')

    const post = maybeServeDocs(
      new Request('https://docs.example.com/', { method: 'POST' }),
    )
    assert.ok(post)
    assert.equal(post.status, 405)
    assert.equal(post.headers.get('allow'), 'GET, HEAD')

    const missing = maybeServeDocs(
      new Request('https://docs.example.com/unknown'),
    )
    assert.ok(missing)
    assert.equal(missing.status, 404)

    assert.equal(maybeServeDocs(new Request('https://yeeet.dev/')), null)
  })
})

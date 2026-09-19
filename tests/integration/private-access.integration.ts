import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { deployments, sites, user } from '../../src/db/schema'
import {
  hashDeploymentPassword,
  shareTokenForDeployment,
  verifyDeploymentPassword,
} from '../../src/server/deployment-access'
import { maybeServeSite } from '../../src/server/site-gateway'
import { siteUrl } from '../../src/server/platform-config'
import { GENERATED_SOCIAL_IMAGE_PATH } from '../../src/server/site-social-metadata'

after(() => db.$client.end())
test('private access verifies passwords, constrains redirects, and revokes old share grants', async () => {
  const owner = randomUUID(),
    siteId = randomUUID(),
    deploymentId = randomUUID()
  const slug = `private-${owner.slice(0, 8)}`,
    nonce = randomUUID()
  const password = 'Local-private-fixture-2026'
  const previousSecret = process.env.BETTER_AUTH_SECRET
  process.env.BETTER_AUTH_SECRET =
    'local-integration-secret-at-least-32-characters'
  await db.insert(user).values({
    id: owner,
    name: 'Private fixture',
    email: `${owner}@example.com`,
  })
  try {
    await db.insert(sites).values({
      id: siteId,
      userId: owner,
      slug,
      activeDeploymentId: deploymentId,
    })
    const passwordHash = await hashDeploymentPassword(password)
    await db.insert(deployments).values({
      id: deploymentId,
      siteId,
      userId: owner,
      status: 'ready',
      passwordHash,
      shareNonce: nonce,
    })
    const base = siteUrl(slug)
    const locked = await maybeServeSite(new Request(base))
    assert.equal(locked?.status, 401)
    assert.match(locked.headers.get('cache-control') ?? '', /no-store/)
    const unlock = (value: string, returnTo = '/docs') =>
      maybeServeSite(
        new Request(`${base}/_yeeet/unlock`, {
          method: 'POST',
          body: new URLSearchParams({ password: value, returnTo }),
        }),
      )
    assert.equal((await unlock('wrong-password'))?.status, 401)
    assert.equal(
      await verifyDeploymentPassword('x'.repeat(129), passwordHash),
      false,
    )
    const granted = await unlock(password, '/\\example.com')
    assert.equal(granted?.status, 303)
    assert.equal(granted.headers.get('location'), '/')
    const cookie = granted.headers.get('set-cookie')!
    assert.ok(cookie.includes('HttpOnly'))
    assert.ok(cookie.includes('Secure'))
    const imageRequest = new Request(`${base}${GENERATED_SOCIAL_IMAGE_PATH}`, {
      headers: { cookie: cookie.split(';')[0] },
    })
    const allowed = await maybeServeSite(imageRequest)
    assert.equal(allowed?.status, 200)
    assert.equal(allowed.headers.get('content-type'), 'image/png')
    assert.match(allowed.headers.get('cache-control') ?? '', /no-store/)
    const share = shareTokenForDeployment(deploymentId, nonce)
    const shared = await maybeServeSite(
      new Request(`${base}//example.com?share=${encodeURIComponent(share)}`),
    )
    assert.equal(shared?.status, 303)
    assert.equal(shared.headers.get('location'), '/')
    await db
      .update(deployments)
      .set({ shareNonce: randomUUID() })
      .where(eq(deployments.id, deploymentId))
    assert.equal((await maybeServeSite(imageRequest))?.status, 401)
    assert.equal(
      (
        await maybeServeSite(
          new Request(`${base}?share=${encodeURIComponent(share)}`),
        )
      )?.status,
      401,
    )
  } finally {
    await db.delete(user).where(eq(user.id, owner))
    if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = previousSecret
  }
})

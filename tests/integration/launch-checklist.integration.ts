import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { deployments, sites, user } from '../../src/db/schema'
import { launchChecklist } from '../../src/server/launch-checklist'

after(() => db.$client.end())
test('checklist reflects empty and published site state without leaking to outsiders', async () => {
  const owner = randomUUID(),
    site = randomUUID(),
    version = randomUUID(),
    slug = `check-${owner.slice(0, 8)}`
  await db
    .insert(user)
    .values({ id: owner, name: 'Checklist', email: `${owner}@example.com` })
  try {
    await db.insert(sites).values({ id: site, userId: owner, slug })
    const empty = await launchChecklist(owner, slug)
    assert.equal(empty.ready, false)
    assert.equal(empty.rootReady, false)
    await db.insert(deployments).values({
      id: version,
      siteId: site,
      userId: owner,
      status: 'ready',
      redirectRules: JSON.stringify([
        { from: '/', to: 'https://example.com', status: 302 },
      ]),
    })
    await db
      .update(sites)
      .set({ activeDeploymentId: version })
      .where(eq(sites.id, site))
    await db.insert(deployments).values({
      id: randomUUID(),
      siteId: site,
      userId: owner,
      status: 'ready',
      expiresAt: new Date(Date.now() - 1000),
    })
    const ready = await launchChecklist(owner, slug)
    assert.equal(ready.ready, true)
    assert.equal(ready.rootStatus, 302)
    assert.equal(ready.rootReady, true)
    assert.equal(ready.readyVersions, 1)
    assert.equal(ready.healthPassed, false)
    await assert.rejects(launchChecklist('other', slug), /Site not found/)
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

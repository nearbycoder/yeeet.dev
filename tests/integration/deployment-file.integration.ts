import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { deploymentFiles, deployments, sites, user } from '../../src/db/schema'
import { ownedDeploymentFile } from '../../src/server/deployment-file'

after(() => db.$client.end())
test('file access is scoped to owner, site, ready version, and exact manifest path', async () => {
  const owner = randomUUID(),
    site = randomUUID(),
    version = randomUUID(),
    slug = `files-${owner.slice(0, 8)}`
  await db
    .insert(user)
    .values({ id: owner, name: 'File fixture', email: `${owner}@example.com` })
  try {
    await db.insert(sites).values({ id: site, userId: owner, slug })
    await db
      .insert(deployments)
      .values({ id: version, siteId: site, userId: owner, status: 'ready' })
    await db.insert(deploymentFiles).values({
      id: randomUUID(),
      deploymentId: version,
      path: 'index.html',
      storageKey: 'fixture/key',
      size: 12,
      contentType: 'text/html',
    })
    const input = { slug, version, path: 'index.html' }
    assert.equal(
      (await ownedDeploymentFile(owner, input)).storageKey,
      'fixture/key',
    )
    for (const [actor, params] of [
      ['outsider', input],
      [owner, { ...input, slug: 'another-site' }],
      [owner, { ...input, version: randomUUID() }],
      [owner, { ...input, path: '../index.html' }],
    ] as const)
      await assert.rejects(ownedDeploymentFile(actor, params), /File not found/)
    await db
      .update(deployments)
      .set({ status: 'uploading' })
      .where(eq(deployments.id, version))
    await assert.rejects(ownedDeploymentFile(owner, input), /File not found/)
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

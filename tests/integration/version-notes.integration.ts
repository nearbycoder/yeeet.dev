import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { deployments, sites, user } from '../../src/db/schema'
import { saveVersionNotes } from '../../src/server/version-notes'
import { listSiteVersions } from '../../src/server/deployments'

after(() => db.$client.end())
test('release notes persist, search, reject outsiders and stale edits, and clear', async () => {
  const owner = randomUUID(),
    site = randomUUID(),
    version = randomUUID(),
    slug = `release-${owner.slice(0, 8)}`
  await db.insert(user).values({
    id: owner,
    name: 'Release fixture',
    email: `${owner}@example.com`,
  })
  try {
    await db.insert(sites).values({ id: site, userId: owner, slug })
    await db
      .insert(deployments)
      .values({ id: version, siteId: site, userId: owner, status: 'ready' })
    const input = {
      slug,
      version,
      label: 'Autumn launch',
      notes: '<b>Plain text</b>',
      expectedLabel: '',
      expectedNotes: '',
    }
    await saveVersionNotes(owner, input)
    assert.equal(
      (await listSiteVersions(owner, slug, 25, { q: 'autumn' })).versions
        .length,
      1,
    )
    await assert.rejects(saveVersionNotes(owner, input), /changed elsewhere/)
    await assert.rejects(saveVersionNotes('other', input), /Site not found/)
    await saveVersionNotes(owner, {
      ...input,
      label: '',
      notes: '',
      expectedLabel: input.label,
      expectedNotes: input.notes,
    })
    assert.equal(
      (await listSiteVersions(owner, slug)).versions[0].releaseLabel,
      '',
    )
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

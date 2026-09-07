import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { sites, user } from '../../src/db/schema'
import { saveSiteNotes } from '../../src/server/site-notes'

after(() => db.$client.end())
test('site notes persist, reject stale edits and clear intentionally', async () => {
  const owner = randomUUID(),
    slug = `notes-${owner.slice(0, 8)}`
  await db
    .insert(user)
    .values({ id: owner, name: 'Notes fixture', email: `${owner}@example.com` })
  try {
    await db.insert(sites).values({ id: randomUUID(), userId: owner, slug })
    await saveSiteNotes(owner, { slug, notes: 'first', expectedNotes: '' })
    await assert.rejects(
      saveSiteNotes(owner, { slug, notes: 'stale', expectedNotes: '' }),
      /changed elsewhere/,
    )
    await assert.rejects(
      saveSiteNotes('other', {
        slug,
        notes: 'foreign',
        expectedNotes: 'first',
      }),
      /Site not found/,
    )
    await saveSiteNotes(owner, { slug, notes: '', expectedNotes: 'first' })
    assert.equal(
      (await db.query.sites.findFirst({ where: eq(sites.slug, slug) }))?.notes,
      '',
    )
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

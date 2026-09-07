import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { inArray } from 'drizzle-orm'
import { db } from '../../src/db'
import { sites, deployments, user } from '../../src/db/schema'
import { storageInventory } from '../../src/server/storage-inventory'

after(() => db.$client.end())
test('inventory totals, sorting, pagination and literal search stay owner scoped', async () => {
  const owner = randomUUID(),
    other = randomUUID(),
    prefix = owner.slice(0, 8)
  await db.insert(user).values(
    [owner, other].map((id) => ({
      id,
      name: 'Inventory',
      email: `${id}@example.com`,
    })),
  )
  try {
    const rows = Array.from({ length: 27 }, (_, i) => ({
      id: randomUUID(),
      userId: owner,
      slug: `storage-${prefix}-${String(i).padStart(2, '0')}`,
    }))
    await db
      .insert(sites)
      .values([
        ...rows,
        { id: other, userId: other, slug: `foreign-${prefix}` },
      ])
    await db.insert(deployments).values([
      ...rows.map((site, i) => ({
        id: randomUUID(),
        siteId: site.id,
        userId: owner,
        totalBytes: i,
        status: 'ready' as const,
      })),
      {
        id: randomUUID(),
        siteId: other,
        userId: other,
        totalBytes: 999999,
        status: 'ready' as const,
      },
    ])
    const first = await storageInventory(owner, {})
    assert.equal(first.totalBytes, 351)
    assert.equal(first.totalVersions, 27)
    assert.equal(first.rows.length, 25)
    assert.equal(first.rows[0].bytes, 26)
    const second = await storageInventory(owner, { page: 1 })
    assert.equal(second.rows.length, 2)
    assert.equal(second.hasMore, false)
    assert.equal(
      new Set([...first.rows, ...second.rows].map((row) => row.id)).size,
      27,
    )
    const names = await storageInventory(owner, { sort: 'name' })
    assert.equal(names.rows[0].slug, rows[0].slug)
    assert.equal((await storageInventory(owner, { q: '%' })).rows.length, 0)
    assert.equal(
      (await storageInventory(owner, { q: rows[1].slug })).rows.length,
      1,
    )
    assert.equal((await storageInventory('nobody', {})).totalBytes, 0)
  } finally {
    await db.delete(user).where(inArray(user.id, [owner, other]))
  }
})

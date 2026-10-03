import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db'
import { user, sites, siteAnalyticsDaily } from '../../src/db/schema'
import { getSiteAnalytics } from '../../src/server/analytics'

after(() => db.$client.end())
test('analytics compares two bounded periods without leaking another owner’s data', async () => {
  const owner = randomUUID(),
    site = randomUUID(),
    slug = `analytics-${owner.slice(0, 8)}`
  await db.insert(user).values({
    id: owner,
    name: 'Analytics review',
    email: `${owner}@example.com`,
  })
  try {
    await db.insert(sites).values({ id: site, userId: owner, slug })
    const stamp = (offset: number) => {
      const date = new Date()
      date.setUTCDate(date.getUTCDate() + offset)
      return date.toISOString().slice(0, 10)
    }
    await db.insert(siteAnalyticsDaily).values(
      [
        { date: stamp(0), views: 5, status: 200 },
        { date: stamp(-6), views: 2, status: 404 },
        { date: stamp(-7), views: 3, status: 302 },
        { date: stamp(-13), views: 8, status: 200 },
        { date: stamp(-14), views: 100, status: 200 },
        { date: stamp(1), views: 100, status: 200 },
      ].map((row) => ({
        ...row,
        id: randomUUID(),
        siteId: site,
        userId: owner,
        path: '/',
      })),
    )
    const report = await getSiteAnalytics(owner, slug, 7)
    assert.equal(report.totalViews, 7)
    assert.equal(report.comparison.totalViews, 11)
    assert.equal(report.statuses.errors, 2)
    assert.equal(report.comparison.statuses.redirects, 3)
    assert.equal(report.daily.length, 7)
    assert.equal((await getSiteAnalytics(owner, slug, 999)).period.days, 90)
    await assert.rejects(
      getSiteAnalytics('outsider', slug, 7),
      /Site not found/,
    )
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

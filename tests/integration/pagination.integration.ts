import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, test } from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../src/db'
import {
  deploymentFeedback,
  deployments,
  sitePreferences,
  sites,
  user,
  workspaceSites,
  workspaces,
} from '../../src/db/schema'
import { searchSites } from '../../src/server/site-search'
import { findSiteVersion, listSiteVersions } from '../../src/server/deployments'
import { workspaceConsole } from '../../src/server/workspaces'

if (!process.env.DATABASE_URL)
  throw new Error(
    'Use an isolated, migrated PostgreSQL database for integration tests.',
  )
after(() => db.$client.end())
test('SQL pagination searches beyond first pages without gaps, duplicates, or cross-owner access', async () => {
  const owner = randomUUID()
  const prefix = `page-${owner.slice(0, 8)}`
  await db.insert(user).values({
    id: owner,
    name: 'Pagination fixture',
    email: `${owner}@example.invalid`,
  })
  try {
    const fixtures = Array.from({ length: 61 }, (_, i) => ({
      id: randomUUID(),
      userId: owner,
      slug: `${prefix}-${i}`,
      createdAt: sql`'2026-01-01 00:00:00.123456'::timestamp`,
    }))
    await db.insert(sites).values(fixtures)
    let cursor: string | undefined
    const seen = new Set<string>()
    do {
      const page = await searchSites(owner, { cursor })
      assert.ok(page.sites.length <= 20)
      assert.equal(page.totalCount, 61)
      for (const site of page.sites) {
        assert.ok(!seen.has(site.id))
        seen.add(site.id)
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    assert.equal(seen.size, 61)
    const site = fixtures[0]
    await db.insert(sitePreferences).values({
      id: randomUUID(),
      userId: owner,
      siteId: site.id,
      favorite: true,
      project: '100%_done',
      tags: '["special"]',
    })
    assert.equal(
      (
        await searchSites(owner, {
          q: '100%_',
          favorites: true,
          status: 'inactive',
        })
      ).matchedCount,
      1,
    )
    assert.equal((await searchSites(owner, { q: '100%X' })).matchedCount, 0)
    assert.equal((await searchSites(owner, { q: 'SPECIAL' })).matchedCount, 1)
    const versions = Array.from({ length: 126 }, (_, i) => ({
      id: randomUUID(),
      siteId: site.id,
      userId: owner,
      status: 'ready' as const,
      source: i === 0 ? 'needle' : 'integration',
      createdAt: sql`'2025-01-01 00:00:00.654321'::timestamp`,
    }))
    await db.insert(deployments).values(versions)
    seen.clear()
    cursor = undefined
    do {
      const page = await listSiteVersions(owner, site.slug, 25, { cursor })
      assert.ok(page.versions.length <= 25)
      for (const version of page.versions) {
        assert.ok(!seen.has(version.id))
        seen.add(version.id)
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    assert.equal(seen.size, 126)
    const oldest = versions.map((v) => v.id).sort()[0]
    assert.equal(
      (await findSiteVersion(owner, site.slug, oldest)).version.id,
      oldest,
    )
    assert.equal(
      (await listSiteVersions(owner, site.slug, 25, { q: 'needle' })).versions
        .length,
      1,
    )
    await assert.rejects(
      findSiteVersion('other-owner', site.slug, oldest),
      /Site not found/,
    )
    const workspace = randomUUID()
    await db
      .insert(workspaces)
      .values({ id: workspace, ownerId: owner, name: 'Paging' })
    await db
      .insert(workspaceSites)
      .values({ id: randomUUID(), workspaceId: workspace, siteId: site.id })
    await db.insert(deploymentFeedback).values(
      Array.from({ length: 111 }, (_, i) => ({
        id: randomUUID(),
        workspaceId: workspace,
        deploymentId: oldest,
        authorId: owner,
        body: i === 0 ? 'needle 100%_' : 'review',
        resolved: i === 0,
        createdAt: sql`'2026-01-01 00:00:00.987654'::timestamp`,
      })),
    )
    seen.clear()
    cursor = undefined
    do {
      const page: NonNullable<
        Awaited<ReturnType<typeof workspaceConsole>>['selected']
      > = (
        await workspaceConsole(owner, {
          workspace,
          site: site.slug,
          version: oldest,
          feedbackCursor: cursor,
        })
      ).selected!
      assert.equal(page.version?.id, oldest)
      assert.ok(page.comments.length <= 25)
      for (const comment of page.comments) {
        assert.ok(!seen.has(comment.id))
        seen.add(comment.id)
      }
      cursor = page.feedbackNextCursor ?? undefined
    } while (cursor)
    assert.equal(seen.size, 111)
    const filtered = (
      await workspaceConsole(owner, {
        workspace,
        site: site.slug,
        version: oldest,
        feedbackQuery: '100%_',
        feedbackStatus: 'resolved',
      })
    ).selected!
    assert.equal(filtered.comments.length, 1)
    await assert.rejects(
      workspaceConsole('other-owner', { workspace, site: site.slug }),
      /Workspace not found/,
    )
  } finally {
    await db.delete(user).where(eq(user.id, owner))
  }
})

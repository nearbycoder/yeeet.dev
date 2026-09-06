import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { retentionCandidates, retentionSchema } from '../src/lib/retention'
import { previewRetention } from '../src/server/retention'

test('retention preserves newest versions, reference targets, recent builds, and uploads', () => {
  const now = Date.parse('2026-09-01')
  const version = (id: string, days: number, status = 'ready') => ({
    id,
    status,
    totalBytes: 10,
    createdAt: new Date(now - days * 86400000),
  })
  const versions = [
    version('live', 100),
    version('channel', 90),
    version('feedback', 80),
    version('upload', 70, 'uploading'),
    version('old', 60),
    version('newest', 50),
    version('recent', 1),
  ]
  assert.deepEqual(
    retentionCandidates(
      versions,
      new Set(['live', 'channel', 'feedback']),
      2,
      30,
      now,
    ).map((v) => v.id),
    ['old'],
  )
  assert.equal(versions[0].id, 'live')
})
test('retention is bounded and refuses policies that keep no versions or delete fresh builds', () => {
  assert.throws(() =>
    retentionSchema.parse({ slug: 'comet', keepCount: 0, minAgeDays: 1 }),
  )
  assert.throws(() =>
    retentionSchema.parse({ slug: 'comet', keepCount: 1, minAgeDays: 0 }),
  )
  const versions = Array.from({ length: 100 }, (_, i) => ({
    id: String(i),
    status: 'ready',
    createdAt: new Date(0),
    totalBytes: 1,
  }))
  assert.equal(retentionCandidates(versions, new Set(), 1, 1).length, 50)
})
test('cleanup preview rejects a site outside the current account', async (t) => {
  t.mock.method(db.query.sites, 'findFirst', async () => undefined)
  await assert.rejects(
    previewRetention('outsider', {
      slug: 'comet',
      keepCount: 10,
      minAgeDays: 30,
    }),
    /Site not found/,
  )
})

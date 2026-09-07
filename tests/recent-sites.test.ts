import assert from 'node:assert/strict'
import test from 'node:test'
import { rememberSite, recentSitesKey } from '../src/lib/recent-sites'

test('recent sites deduplicate, move revisits to the front, bound history and reject unsafe slugs', () => {
  let items = rememberSite([], 'comet', 1)
  for (let i = 0; i < 9; i++) items = rememberSite(items, `site-${i}`, i + 2)
  assert.equal(items.length, 8)
  const next = rememberSite(items, 'site-3', 100)
  assert.equal(next[0].slug, 'site-3')
  assert.equal(next.filter((item) => item.slug === 'site-3').length, 1)
  assert.throws(() => rememberSite([], '../settings'))
  assert.notEqual(recentSitesKey('alice'), recentSitesKey('bob'))
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { saveView, savedViewsSchema } from '../src/lib/saved-views'

test('saved views update names case-insensitively, strip cursor/destination data, and enforce limits', () => {
  const first = saveView([], ' Launches ', {
    q: 'comet',
    cursor: 'stale',
    site: 'private-destination',
  })
  assert.deepEqual(first[0].filters, { q: 'comet' })
  const updated = saveView(first, 'launches', { favorites: true })
  assert.equal(updated.length, 1)
  assert.equal(updated[0].id, first[0].id)
  assert.throws(() => saveView([], '  ', {}))
  assert.throws(() => savedViewsSchema.parse(Array(13).fill(first[0])))
})

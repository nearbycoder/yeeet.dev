import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { siteNotesSchema } from '../src/lib/site-notes'
import { saveSiteNotes } from '../src/server/site-notes'

test('site notes preserve plain text and enforce size limits', () => {
  assert.equal(
    siteNotesSchema.parse({
      slug: 'comet',
      notes: '<b>plain</b>\nnotes',
      expectedNotes: '',
    }).notes,
    '<b>plain</b>\nnotes',
  )
  assert.throws(() =>
    siteNotesSchema.parse({
      slug: 'comet',
      notes: 'a'.repeat(4001),
      expectedNotes: '',
    }),
  )
})
test('an outsider cannot write site notes', async (t) => {
  t.mock.method(db.query.sites, 'findFirst', async () => undefined)
  await assert.rejects(
    saveSiteNotes('outsider', {
      slug: 'comet',
      notes: 'change',
      expectedNotes: '',
    }),
    /Site not found/,
  )
})

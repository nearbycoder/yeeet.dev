import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeCursor,
  encodeCursor,
  searchPattern,
} from '../src/server/pagination'

test('page cursors preserve PostgreSQL microseconds and reject other users or filters', () => {
  const row = { cursorTime: '2026-09-06T12:00:00.123456', id: 'version-id' }
  const scope = ['versions', 'owner', 'site', 'ready']
  const token = encodeCursor(row, scope)
  assert.equal(decodeCursor(token, scope)?.t, row.cursorTime)
  assert.equal(decodeCursor(token, scope)?.id, row.id)
  assert.throws(
    () => decodeCursor(token, ['versions', 'other', 'site', 'ready']),
    /invalid/,
  )
  assert.throws(
    () => decodeCursor(token, ['versions', 'owner', 'site', 'all']),
    /invalid/,
  )
  assert.throws(() => decodeCursor('invalid', scope), /invalid/)
  assert.equal(decodeCursor(undefined, scope), null)
})
test('search treats SQL wildcard characters as literal text', () => {
  assert.equal(searchPattern('100%_\\'), '%100\\%\\_\\\\%')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { duplicateAssets } from '../src/lib/duplicate-assets'

test('duplicate assets require recorded checksum and matching nonzero size', () => {
  const file = {
    path: 'a',
    size: 10,
    checksum: 'a'.repeat(64),
    contentType: 'text/plain',
  }
  const groups = duplicateAssets([
    file,
    { ...file, path: 'b', checksum: 'A'.repeat(64) },
    { ...file, path: 'c', size: 11 },
    { ...file, path: 'd', checksum: null },
    { ...file, path: 'e', size: 0 },
    { ...file, path: 'f', size: 0 },
  ])
  assert.equal(groups.length, 1)
  assert.deepEqual(
    groups[0].files.map((f) => f.path),
    ['a', 'b'],
  )
  assert.equal(groups[0].redundantBytes, 10)
  assert.deepEqual(duplicateAssets([]), [])
})

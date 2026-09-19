import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeUploadFiles } from '../src/lib/merge-upload-files'

test('adding files replaces exact paths without losing existing entries or mutating inputs', () => {
  const old = [
    { path: 'a', value: 1 },
    { path: 'nested/a', value: 2 },
  ]
  assert.deepEqual(
    mergeUploadFiles(old, [
      { path: 'a', value: 3 },
      { path: 'b', value: 4 },
    ]),
    [
      { path: 'a', value: 3 },
      { path: 'nested/a', value: 2 },
      { path: 'b', value: 4 },
    ],
  )
  assert.equal(old[0].value, 1)
  assert.deepEqual(mergeUploadFiles(old, []), old)
})

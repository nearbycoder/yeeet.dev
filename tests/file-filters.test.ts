import assert from 'node:assert/strict'
import test from 'node:test'
import { fileFilterSearchSchema } from '../src/lib/file-filters'

test('bookmark filters constrain sort/type and bound query size', () => {
  assert.deepEqual(
    fileFilterSearchSchema.parse({
      fileQuery: 'a b',
      fileType: 'HTML',
      fileOrder: 'largest',
      secret: 'ignored',
    }),
    { fileQuery: 'a b', fileType: 'HTML', fileOrder: 'largest' },
  )
  assert.equal(
    fileFilterSearchSchema.safeParse({ fileOrder: 'arbitrary' }).success,
    false,
  )
  assert.equal(
    fileFilterSearchSchema.safeParse({ fileQuery: 'x'.repeat(201) }).success,
    false,
  )
})

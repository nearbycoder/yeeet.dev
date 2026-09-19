import assert from 'node:assert/strict'
import test from 'node:test'
import {
  deployByteLimit,
  DEFAULT_MAX_DEPLOY_BYTES,
  uploadLimitErrors,
} from '../src/lib/upload-limits'

test('upload limits accept the exact boundary and reject count or size excess', () => {
  const limits = { maxFileCount: 5000, maxDeployBytes: 1024 }
  assert.deepEqual(uploadLimitErrors(5000, 1024, limits), [])
  assert.equal(uploadLimitErrors(5001, 1025, limits).length, 2)
  assert.equal(deployByteLimit('2048'), 2048)
  assert.equal(deployByteLimit('0'), 0)
  assert.equal(
    uploadLimitErrors(1, 1, { maxFileCount: 5000, maxDeployBytes: 0 }).length,
    1,
  )
  for (const value of [undefined, '', '-1', 'NaN', 'Infinity', '1.5'])
    assert.equal(deployByteLimit(value), DEFAULT_MAX_DEPLOY_BYTES)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { assetBudget } from '../src/lib/asset-budget'

test('asset budgets distinguish exact limits, oversize files and total bytes without sorting source data', () => {
  const files = [
    { path: 'a.css', size: 1024, contentType: 'text/css', checksum: null },
    {
      path: 'b.js',
      size: 1024 * 1024,
      contentType: 'text/javascript',
      checksum: null,
    },
  ]
  const result = assetBudget(files, 1, 1)
  assert.equal(result.overFiles.length, 1)
  assert.equal(result.overTotal, 1024)
  assert.equal(result.largest[0].path, 'b.js')
  assert.equal(files[0].path, 'a.css')
  assert.equal(assetBudget([], NaN, -1).overTotal, 0)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { fileGrowth } from '../src/lib/file-growth'

test('size comparisons account for added, removed, growing, shrinking and same-size files', () => {
  const before = [
    { path: 'grow', size: 10 },
    { path: 'shrink', size: 30 },
    { path: 'remove', size: 40 },
    { path: 'same', size: 5 },
  ]
  const after = [
    { path: 'grow', size: 20 },
    { path: 'shrink', size: 10 },
    { path: 'add', size: 100 },
    { path: 'same', size: 5 },
  ]
  const report = fileGrowth(after, before)
  assert.equal(report.beforeBytes, 85)
  assert.equal(report.afterBytes, 135)
  assert.equal(report.delta, 50)
  assert.deepEqual(
    report.changes.map((f) => [f.path, f.delta, f.kind]),
    [
      ['add', 100, 'added'],
      ['remove', -40, 'removed'],
      ['shrink', -20, 'changed'],
      ['grow', 10, 'changed'],
    ],
  )
  assert.equal(
    report.changes.reduce((sum, f) => sum + f.delta, 0),
    report.delta,
  )
  assert.deepEqual(fileGrowth([], []).changes, [])
})

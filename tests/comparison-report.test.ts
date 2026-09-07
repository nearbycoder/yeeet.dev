import assert from 'node:assert/strict'
import test from 'node:test'
import { comparisonReport } from '../src/lib/comparison-report'

test('comparison exports preserve version identity, change classes and delivery changes', () => {
  const diff = {
    base: 'old',
    target: 'new',
    added: ['a`b.js', 'line\nfile'],
    removed: ['old.js'],
    changed: [],
    unchanged: ['index.html'],
    summary: { uploadBytes: 20, unchangedBytes: 5 },
    routingChanged: true,
    headersChanged: false,
    redirectsChanged: false,
  }
  const json = JSON.parse(comparisonReport('comet', diff, 'json'))
  assert.deepEqual(json.added, diff.added)
  assert.equal(json.routingChanged, true)
  const md = comparisonReport('comet', diff, 'md')
  assert.ok(md.includes('`` a`b.js ``'))
  assert.ok(md.includes('line\\nfile'))
  assert.ok(md.includes('## removed (1)'))
})

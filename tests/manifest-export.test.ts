import assert from 'node:assert/strict'
import test from 'node:test'
import { csvCell } from '../src/lib/download'
import { manifestExport } from '../src/lib/manifest-export'

test('CSV neutralizes formulas and escapes embedded quotes and newlines', () => {
  assert.equal(csvCell('  =SUM(1)'), '"\'  =SUM(1)"')
  assert.equal(csvCell('a,"b\nc'), '"a,""b\nc"')
})
test('manifest exports include all files and explicit safe metadata only', () => {
  const input = {
    id: 'v1',
    source: 'web',
    createdAt: '2026-09-07',
    passwordHash: 'secret',
    files: [
      {
        path: 'index.html',
        size: 10,
        contentType: 'text/html',
        checksum: null,
        storageKey: 'private',
      },
    ],
  }
  const json = manifestExport('comet', input, 'json')
  assert.equal(JSON.parse(json).files.length, 1)
  assert.ok(!json.includes('secret') && !json.includes('private'))
  assert.ok(manifestExport('comet', input, 'csv').includes('"index.html","10"'))
})

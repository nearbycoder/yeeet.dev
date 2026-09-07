import assert from 'node:assert/strict'
import test from 'node:test'
import { exploreFiles, fileFamily } from '../src/lib/file-explorer'

test('file explorer combines literal case-insensitive paths, families and stable size sorting without mutating files', () => {
  const files = [
    { path: 'b.css', size: 20, contentType: 'text/css', checksum: null },
    { path: 'a.css', size: 20, contentType: 'text/css', checksum: null },
    { path: 'index.html', size: 100, contentType: 'text/html', checksum: null },
  ]
  assert.deepEqual(
    exploreFiles(files, ' .CSS ', 'Stylesheets', 'largest').map((f) => f.path),
    ['a.css', 'b.css'],
  )
  assert.equal(exploreFiles(files, '', '', 'largest')[0].path, 'index.html')
  assert.equal(exploreFiles(files, 'missing', '', 'path').length, 0)
  assert.equal(files[0].path, 'b.css')
  assert.equal(fileFamily('application/javascript'), 'JavaScript')
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { publishFolders, selectPublishFolder } from '../src/lib/publish-folder'

test('publish folder strips only its own prefix and can restore the original selection', () => {
  const files = [
    { path: 'README.md' },
    { path: 'dist/index.html' },
    { path: 'dist/app.js' },
    { path: 'dist-other/index.html' },
  ]
  assert.deepEqual(publishFolders(files), ['dist', 'dist-other'])
  assert.deepEqual(
    selectPublishFolder(files, 'dist').map((f) => f.path),
    ['index.html', 'app.js'],
  )
  assert.equal(files[1].path, 'dist/index.html')
  assert.equal(selectPublishFolder(files, ''), files)
  assert.throws(() => selectPublishFolder(files, 'dis'))
})

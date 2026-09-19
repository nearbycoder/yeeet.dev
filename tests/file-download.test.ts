import assert from 'node:assert/strict'
import test from 'node:test'
import { fileDownloadHeaders } from '../src/server/file-download'

test('downloads force attachment and encode filenames without header injection', () => {
  const headers = new Headers(fileDownloadHeaders('nested/café"\r\n.html'))
  assert.equal(headers.get('content-type'), 'application/octet-stream')
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.ok(headers.get('content-disposition')?.startsWith('attachment;'))
  assert.ok(
    headers.get('content-disposition')?.includes('caf%C3%A9%22%0D%0A.html'),
  )
  assert.ok(!headers.get('content-disposition')?.includes('nested/'))
  assert.equal(headers.get('cache-control'), 'private, no-store')
})

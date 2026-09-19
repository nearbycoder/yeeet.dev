import assert from 'node:assert/strict'
import test from 'node:test'
import { canPreviewText, TEXT_PREVIEW_BYTES } from '../src/lib/text-preview'
import { readPreviewStream } from '../src/server/deployment-file'

test('preview accepts text formats and bounds reads even if storage ignores Range', async () => {
  assert.equal(canPreviewText('text/html; charset=utf-8'), true)
  assert.equal(canPreviewText('application/manifest+json'), true)
  assert.equal(canPreviewText('image/png'), false)
  let canceled = false
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array(TEXT_PREVIEW_BYTES + 100).fill(65))
    },
    cancel() {
      canceled = true
    },
  })
  assert.equal((await readPreviewStream(stream)).length, TEXT_PREVIEW_BYTES)
  assert.equal(canceled, true)
  await assert.rejects(
    readPreviewStream(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array([0]))
          c.close()
        },
      }),
    ),
    /binary data/,
  )
})

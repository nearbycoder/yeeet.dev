import assert from 'node:assert/strict'
import test from 'node:test'
import { deleteStoredPrefix, getStorage } from '../src/server/storage'

test('partial object deletion errors fail the job so durable cleanup can retry', async (t) => {
  process.env.S3_ENDPOINT = 'http://127.0.0.1:9999'
  process.env.S3_BUCKET = 'test'
  process.env.S3_ACCESS_KEY_ID = 'fixture'
  process.env.S3_SECRET_ACCESS_KEY = 'fixture'
  let calls = 0
  t.mock.method(getStorage().client, 'send', async () => {
    calls++
    return calls === 1
      ? { Contents: [{ Key: 'site/file' }] }
      : { Errors: [{ Key: 'site/file', Code: 'AccessDenied' }] }
  })
  await assert.rejects(deleteStoredPrefix('site/'), /could not be deleted/)
  assert.equal(calls, 2)
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { createUploadUrl } from '../src/server/storage'

test('upload signatures use the storage region instead of the host region', async (t) => {
  const fixture = {
    S3_ENDPOINT: 'https://storage.example.com',
    S3_BUCKET: 'assets',
    S3_ACCESS_KEY_ID: 'fixture',
    S3_SECRET_ACCESS_KEY: 'fixture',
    REGION: 'iad',
    S3_REGION: undefined,
  }
  const original = Object.fromEntries(
    Object.keys(fixture).map((key) => [key, process.env[key]]),
  )
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, fixture)

  for (const region of [undefined, '', 'eu-west-1']) {
    if (region === undefined) delete process.env.S3_REGION
    else process.env.S3_REGION = region
    const url = new URL(
      await createUploadUrl({
        key: 'sites/test/index.html',
        contentType: 'text/html',
        deploymentId: 'test',
      }),
    )
    const scope = url.searchParams.get('X-Amz-Credential')?.split('/')
    assert.equal(scope?.[2], region || 'auto')
  }
})

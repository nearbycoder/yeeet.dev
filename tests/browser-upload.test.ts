import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseRecovery,
  recoveryStorageKey,
  retryUpload,
  uploadPool,
} from '../src/lib/browser-upload'

test('recovery metadata is versioned, expires, and is isolated by account', () => {
  const now = Date.now()
  const value = {
    version: 1,
    key: '1180d781-0271-47ac-921d-fb9f7c3cdd57',
    fingerprint: 'a'.repeat(64),
    createdAt: now,
    slug: 'comet',
    channel: '',
    spaFallback: true,
    privateDeploy: true,
    password: 'not-persisted',
  }
  const saved = parseRecovery(JSON.stringify(value), now)
  assert(saved)
  assert.equal('password' in saved, false)
  assert.equal(parseRecovery(JSON.stringify(value), now + 8 * 86400000), null)
  assert.equal(parseRecovery('broken'), null)
  assert.notEqual(recoveryStorageKey('alice'), recoveryStorageKey('bob'))
})
test('file retries recover transient failures and stop after three attempts', async () => {
  const signal = new AbortController().signal
  let attempts = 0
  await retryUpload(
    async () => {
      if (++attempts < 3) throw new Error('offline')
    },
    signal,
    async () => {},
  )
  assert.equal(attempts, 3)
  attempts = 0
  await assert.rejects(
    retryUpload(
      async () => {
        attempts++
        throw new Error('offline')
      },
      signal,
      async () => {},
    ),
    /offline/,
  )
  assert.equal(attempts, 3)
})
test('pause prevents new file requests and waits for in-flight work to settle', async () => {
  const controller = new AbortController()
  let finished = false
  let started = 0
  await assert.rejects(
    uploadPool([1, 2, 3], 2, controller.signal, async (item) => {
      started++
      if (item === 1) controller.abort()
      else await Promise.resolve()
      finished = true
    }),
    { name: 'AbortError' },
  )
  assert.equal(finished, true)
  assert.equal(started, 1)
})
test('a failed file stops scheduling without leaving background uploads running', async () => {
  let active = 0
  let started = 0
  await assert.rejects(
    uploadPool([1, 2, 3, 4], 2, new AbortController().signal, async (item) => {
      started++
      active++
      try {
        await Promise.resolve()
        if (item === 1) throw new Error('failed')
      } finally {
        active--
      }
    }),
    /failed/,
  )
  assert.equal(active, 0)
  assert.equal(started, 2)
})

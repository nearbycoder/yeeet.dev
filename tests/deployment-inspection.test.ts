import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { inspectDeployment } from '../src/server/deployment-inspection'

test('inspection rejects inaccessible sites before loading any files', async (t) => {
  const calls: Array<Array<unknown>> = []
  t.mock.method(
    db.$client,
    'query',
    async (_query: unknown, values: Array<unknown>) => {
      calls.push(values)
      return { rows: [] }
    },
  )
  await assert.rejects(
    inspectDeployment('outsider', 'comet', 'version'),
    /Site not found/,
  )
  assert.deepEqual(calls, [['outsider', 'comet', 1]])
})

test('inspection scopes versions to their site and never selects storage keys or secrets', async (t) => {
  const calls: Array<{ text: string; values: Array<unknown> }> = []
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      calls.push({ text: query.text, values })
      return {
        rows:
          calls.length === 1
            ? [['site-1', 'owner', 'comet', null, '2026-01-01', '2026-01-01']]
            : [],
      }
    },
  )
  await assert.rejects(
    inspectDeployment('owner', 'comet', 'foreign-version'),
    /Version not found/,
  )
  assert.deepEqual(calls[1].values, ['foreign-version', 'site-1', 1])
  assert.doesNotMatch(calls[1].text, /storage_key|password_hash|share_nonce/)
})

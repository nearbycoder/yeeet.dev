import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { listAccountKeys } from '../src/server/account-console'
import { retryWebhookDelivery } from '../src/server/webhooks'

test('account key listing selects only safe metadata for the current user', async (t) => {
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      assert.deepEqual(values, ['owner'])
      assert.doesNotMatch(query.text, /"key"|"permissions"|"metadata"/)
      return { rows: [] }
    },
  )
  assert.deepEqual(await listAccountKeys('owner'), [])
})

test('webhook retry rejects a foreign delivery before any write', async (t) => {
  let calls = 0
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      calls++
      assert.match(query.text, /^select /)
      assert.deepEqual(values, ['foreign-delivery', 'outsider', 1])
      return { rows: [] }
    },
  )
  await assert.rejects(
    retryWebhookDelivery('outsider', 'foreign-delivery'),
    /Delivery not found/,
  )
  assert.equal(calls, 1)
})

test('webhook retry atomically requires failed status and an active owned endpoint', async (t) => {
  t.mock.method(db.query.webhookDeliveries, 'findFirst', async () => ({
    endpointId: 'endpoint',
  }))
  t.mock.method(db.query.webhookEndpoints, 'findFirst', async () => ({
    id: 'endpoint',
  }))
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      assert.match(query.text, /^update /)
      assert.match(query.text, /"status" = \$/)
      assert.deepEqual(values.slice(-3), ['delivery', 'owner', 'failed'])
      return { rows: [] }
    },
  )
  await assert.rejects(
    retryWebhookDelivery('owner', 'delivery'),
    /Only failed deliveries/,
  )
})

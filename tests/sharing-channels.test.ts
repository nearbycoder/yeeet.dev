import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import {
  listSiteChannels,
  updateSiteVersionAccess,
} from '../src/server/deployments'

test('channel listing requires ownership of the named site', async (t) => {
  const values: Array<Array<unknown>> = []
  t.mock.method(
    db.$client,
    'query',
    async (_query: unknown, params: Array<unknown>) => {
      values.push(params)
      return { rows: [] }
    },
  )
  await assert.rejects(listSiteChannels('outsider', 'comet'), /Site not found/)
  assert.deepEqual(values, [['comet', 'outsider', 1]])
})

test('sharing updates cannot change access on an inaccessible site', async (t) => {
  let queries = 0
  t.mock.method(db.$client, 'query', async () => {
    queries++
    return { rows: [] }
  })
  await assert.rejects(
    updateSiteVersionAccess('outsider', 'comet', 'foreign-version', {
      password: null,
    }),
    /Site not found/,
  )
  assert.equal(queries, 1)
})

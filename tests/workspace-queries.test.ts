import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { listSites, listSiteVersions } from '../src/server/deployments'

test('workspace site lookup scopes the SQL to both owner and normalized slug', async (t) => {
  const queries: Array<{ text: string; values: Array<unknown> }> = []
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      queries.push({ text: query.text, values })
      return { rows: [] }
    },
  )
  assert.deepEqual(await listSites('owner-1', 'Comet'), [])
  assert.match(
    queries[0].text,
    /"sites"\."user_id" = \$1 and "sites"\."slug" = \$2/,
  )
  assert.deepEqual(queries[0].values, ['owner-1', 'comet'])
  await listSites('owner-1')
  assert.deepEqual(queries[1].values, ['owner-1'])
})

test('workspace history limits rows in SQL while the full history keeps 100', async (t) => {
  const queries: Array<{ text: string; values: Array<unknown> }> = []
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      queries.push({ text: query.text, values })
      return {
        rows: query.text.includes('from "sites"')
          ? [['site-1', 'owner-1', 'comet', null, '2026-01-01', '2026-01-01']]
          : [],
      }
    },
  )
  await listSiteVersions('owner-1', 'comet', 3)
  assert.deepEqual(queries[0].values, ['comet', 'owner-1', 1])
  assert.match(
    queries[1].text,
    /where "deployments"\."site_id" = \$1 order by .* desc limit \$2/,
  )
  assert.deepEqual(queries[1].values, ['site-1', 3])
  await listSiteVersions('owner-1', 'comet')
  assert.deepEqual(queries[3].values, ['site-1', 100])
})

test('workspace history rejects a site the actor does not own', async (t) => {
  t.mock.method(db.$client, 'query', async () => ({ rows: [] }))
  await assert.rejects(
    listSiteVersions('other-owner', 'comet', 3),
    /Site not found/,
  )
})

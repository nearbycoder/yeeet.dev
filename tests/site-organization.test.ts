import assert from 'node:assert/strict'
import test from 'node:test'
import { db } from '../src/db'
import { organizationSchema } from '../src/lib/site-organization'
import { filterSites } from '../src/lib/site-search'
import { saveSiteOrganization } from '../src/server/site-organization'

test('organization trims groups, normalizes tags, and enforces bounded values', () => {
  assert.deepEqual(
    organizationSchema.parse({
      slug: 'comet',
      favorite: true,
      project: ' Work ',
      tags: ['DOCS', ' docs '],
    }).tags,
    ['docs'],
  )
  assert.throws(() =>
    organizationSchema.parse({
      slug: 'x',
      favorite: false,
      project: '',
      tags: ['x'.repeat(31)],
    }),
  )
})
test('organization filters combine with text search and favorites', () => {
  const site = {
    slug: 'comet',
    activeDeploymentId: 'v1',
    customDomains: [],
    organization: { project: 'Work', favorite: true, tags: ['docs'] },
  }
  assert.deepEqual(filterSites([site], 'DOCS', 'live', 'Work', true), [site])
  assert.deepEqual(filterSites([site], '', 'all', 'Other', true), [])
  assert.deepEqual(
    filterSites(
      [{ ...site, organization: { ...site.organization, favorite: false } }],
      '',
      'all',
      '',
      true,
    ),
    [],
  )
})
test('organization cannot be saved for another owner’s site', async (t) => {
  t.mock.method(
    db.$client,
    'query',
    async (query: { text: string }, values: Array<unknown>) => {
      assert.match(query.text, /^select /)
      assert.deepEqual(values, ['comet', 'outsider', 1])
      return { rows: [] }
    },
  )
  await assert.rejects(
    saveSiteOrganization('outsider', {
      slug: 'comet',
      favorite: true,
      project: 'Work',
      tags: [],
    }),
    /Site not found/,
  )
})

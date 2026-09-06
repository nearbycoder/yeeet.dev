import assert from 'node:assert/strict'
import test from 'node:test'
import { filterSites } from '../src/lib/site-search'

const sites = [
  {
    slug: 'comet',
    activeDeploymentId: 'v1',
    customDomains: [{ hostname: 'docs.example.com' }],
  },
  { slug: 'moon', activeDeploymentId: null, customDomains: [] },
]

test('finds sites by name or custom domain with case-insensitive trimmed input', () => {
  assert.deepEqual(filterSites(sites, ' COMET ', 'all'), [sites[0]])
  assert.deepEqual(filterSites(sites, 'DOCS.EXAMPLE', 'all'), [sites[0]])
  assert.deepEqual(filterSites(sites, 'missing', 'all'), [])
})

test('combines status and search without removing matches from the source list', () => {
  assert.deepEqual(filterSites(sites, '', 'live'), [sites[0]])
  assert.deepEqual(filterSites(sites, '', 'inactive'), [sites[1]])
  assert.deepEqual(filterSites(sites, 'comet', 'inactive'), [])
  assert.deepEqual(filterSites(sites, '', 'all'), sites)
  assert.equal(sites.length, 2)
})

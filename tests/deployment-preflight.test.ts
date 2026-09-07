import assert from 'node:assert/strict'
import test from 'node:test'
import { deploymentPreflight } from '../src/lib/deployment-preflight'

test('preflight identifies exact private-path segments, duplicates and missing entry pages', () => {
  const report = deploymentPreflight(
    [
      '.env.local',
      'nested/.git/config',
      'public.key',
      'node_modules/x.js',
      'app.js.map',
      'Index.html',
      'safe.js',
      'safe.js',
    ].map((path) => ({ path, size: 0 })),
    true,
  )
  assert.deepEqual(report.privatePaths, [
    '.env.local',
    'nested/.git/config',
    'public.key',
  ])
  assert.deepEqual(report.duplicates, ['safe.js'])
  assert.equal(report.missingEntry, true)
  assert.equal(report.dependencies.length, 1)
  assert.equal(report.sourceMaps.length, 1)
  assert.equal(
    deploymentPreflight(
      [
        { path: 'index.html', size: 1 },
        { path: 'env-guide.html', size: 1 },
      ],
      false,
    ).privatePaths.length,
    0,
  )
  assert.equal(deploymentPreflight([], true).missingEntry, false)
})

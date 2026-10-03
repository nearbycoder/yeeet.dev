import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assetComposition,
  fileDirectories,
  filterFileRange,
} from '../src/lib/asset-review'
import {
  analyticsPeriod,
  aggregateWeeks,
  analyticsCsv,
  periodChange,
} from '../src/lib/analytics-report'
import { sourceMatches, formatJsonSource } from '../src/lib/source-reader'
import { matchingUploadPaths } from '../src/lib/upload-rules'
import { releaseCsv } from '../src/lib/release-report'
import { fileFilterSearchSchema } from '../src/lib/file-filters'

const files = [
  {
    path: 'assets/js/app.js',
    size: 1024,
    contentType: 'text/javascript',
    checksum: null,
  },
  {
    path: 'assets/css/app.css',
    size: 512,
    contentType: 'text/css',
    checksum: null,
  },
  {
    path: 'assets-old/app.js',
    size: 2048,
    contentType: 'text/javascript',
    checksum: null,
  },
  { path: 'index.html', size: 0, contentType: 'text/html', checksum: null },
]
test('folder and byte filters preserve exact boundaries and do not mutate the manifest', () => {
  assert.deepEqual(
    fileDirectories(files),
    ['assets-old/', 'assets/', 'assets/css/', 'assets/js/'].sort((a, b) =>
      a.localeCompare(b),
    ),
  )
  assert.deepEqual(
    filterFileRange(files, 'assets/', 512, 1024).map((file) => file.path),
    ['assets/js/app.js', 'assets/css/app.css'],
  )
  assert.deepEqual(
    filterFileRange(files, '', 0, 0).map((file) => file.path),
    ['index.html'],
  )
  assert.equal(filterFileRange(files, '', 1000, 500).length, 0)
  assert.equal(files.length, 4)
  assert.deepEqual(
    fileFilterSearchSchema.parse({
      fileMin: '1.5',
      fileMax: 'Infinity',
      fileDirectory: 'assets/',
    }),
    { fileMin: 1.5, fileMax: undefined, fileDirectory: 'assets/' },
  )
  assert.equal(fileFilterSearchSchema.parse({ fileMin: -1 }).fileMin, undefined)
})
test('asset groups conserve every file and byte, including root and empty assets', () => {
  const folders = assetComposition(files, 'folder')
  assert.equal(
    folders.reduce((sum, group) => sum + group.bytes, 0),
    3584,
  )
  assert.equal(
    folders.reduce((sum, group) => sum + group.count, 0),
    4,
  )
  assert.equal(folders.at(-1)?.name, '(root)')
  assert.equal(assetComposition(files, 'type')[0].bytes, 3072)
})
test('source search is literal, bounded, case-insensitive and reports original line positions', () => {
  assert.deepEqual(sourceMatches('A.*\na.*\nother', 'a.*'), [
    { start: 0, end: 3, line: 1 },
    { start: 4, end: 7, line: 2 },
  ])
  assert.deepEqual(sourceMatches('text', ''), [])
  assert.equal(sourceMatches('a'.repeat(3000), 'a').length, 1000)
  assert.deepEqual(sourceMatches('İ\nhello', 'hello'), [
    { start: 2, end: 7, line: 2 },
  ])
  assert.equal(formatJsonSource('{"ok":true}', false), '{\n  "ok": true\n}')
  assert.throws(() => formatJsonSource('{', false), /not valid JSON/)
  assert.throws(() => formatJsonSource('{}', true), /complete file/)
})
test('upload patterns match root and nested files while keeping regex punctuation literal', () => {
  const paths = [
    'app.js.map',
    'js/app.js.map',
    'js/app.js',
    'node_modules/a.js',
    'nested/node_modules/a.js',
    'docs/[draft].html',
    'docs/draft.html',
    '.env.local',
  ]
  assert.deepEqual(
    matchingUploadPaths(
      paths,
      '# comment\n**/*.map\n**/node_modules/**\n.env*',
    ),
    [
      'app.js.map',
      'js/app.js.map',
      'node_modules/a.js',
      'nested/node_modules/a.js',
      '.env.local',
    ],
  )
  assert.deepEqual(matchingUploadPaths(paths, '*.map'), ['app.js.map'])
  assert.deepEqual(matchingUploadPaths(paths, 'docs/[draft].html'), [
    'docs/[draft].html',
  ])
  assert.deepEqual(matchingUploadPaths(['a.js', 'ab.js'], '?.js'), ['a.js'])
  assert.deepEqual(matchingUploadPaths(['APP.MAP'], '**/*.map'), [])
  assert.deepEqual(
    matchingUploadPaths(['a'.repeat(500) + '.js'], '*a'.repeat(60) + 'b.js'),
    [],
  )
  assert.throws(
    () => matchingUploadPaths(paths, 'x\n'.repeat(31)),
    /at most 30/,
  )
})
test('analytics separates adjacent UTC periods, fills zero days and ignores out-of-range records', () => {
  const result = analyticsPeriod(
    [
      { date: '2026-03-01', path: '/', status: 200, views: 10 },
      { date: '2026-03-07', path: '/old', status: 302, views: 4 },
      { date: '2026-03-08', path: '/new', status: 200, views: 8 },
      { date: '2026-03-14', path: '/(error)', status: 500, views: 2 },
      { date: '2026-03-15', path: '/future', status: 200, views: 100 },
      { date: '2026-02-28', path: '/past', status: 200, views: 100 },
    ],
    7,
    new Date('2026-03-14T23:59:59Z'),
  )
  assert.equal(result.totalViews, 10)
  assert.equal(result.comparison.totalViews, 14)
  assert.deepEqual(result.period, {
    days: 7,
    from: '2026-03-08',
    to: '2026-03-14',
  })
  assert.equal(result.daily.length, 7)
  assert.equal(result.daily[1].views, 0)
  assert.equal(result.statuses.errors, 2)
  assert.equal(result.comparison.statuses.redirects, 4)
  assert.deepEqual(
    result.topPaths.map((item) => item.path),
    ['/new', '/(error)'],
  )
  const weeks = aggregateWeeks(result.daily)
  assert.deepEqual(weeks, [
    { date: '2026-03-02', views: 8 },
    { date: '2026-03-09', views: 2 },
  ])
  assert.equal(periodChange(0, 0), 'No change')
  assert.equal(periodChange(1, 0), 'New traffic')
  assert.equal(periodChange(10, 20), '-50.0%')
})
test('report exports escape spreadsheet formulas, quotes and multiline notes', () => {
  const csv = releaseCsv([
    {
      id: 'v1',
      status: 'ready',
      source: 'web',
      createdAt: '2026-01-01',
      completedAt: null,
      fileCount: 2,
      totalBytes: 50,
      current: true,
      releaseLabel: '=SUM(A1)',
      releaseNotes: 'a "quote"\nnext',
      retentionPinned: false,
    },
  ])
  assert.ok(csv.includes("'="))
  assert.ok(csv.includes('a ""quote""\nnext'))
  assert.ok(
    analyticsCsv({
      daily: [],
      topPaths: [{ path: '=formula', views: 1 }],
      statuses: { successful: 1, redirects: 0, errors: 0 },
    }).includes("'=formula"),
  )
})

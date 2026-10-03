import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { scanDeploymentFiles as cliScan } from '../packages/cli/bin/deployment-files.js'
import { scanDeploymentFiles as mcpScan } from '../packages/mcp/bin/deployment-files.js'
import { deployStaticPath } from '../packages/mcp/bin/yeeet-mcp.js'

const defaults = ['.git/**', 'node_modules/**', '.DS_Store', '.yeeetignore']
const paths = [
  '.hidden',
  'a[1].txt',
  'assets/app.js',
  'assets/app.js.map',
  'assets/deep/a.js',
  'assets/keep.txt',
  'cache/file.txt',
  'docs/a.html',
  'docs/b.html',
  'docs/c.html',
  'index.html',
  'n/1.txt',
  'n/2.txt',
  'n/3.txt',
  'n/10.txt',
  'n/11.txt',
  '{a},b}.txt',
  '{a,b}.txt',
].sort()

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'yeeet-scan-'))
  for (const path of [
    ...paths,
    '.git/config',
    'node_modules/pkg/index.js',
    '.DS_Store',
    '.yeeetignore',
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), 'fixture')
  }
  await symlink(join(root, 'index.html'), join(root, 'linked.html'))
  await symlink(join(root, 'docs'), join(root, 'linked-dir'))
  return root
}

// These expected exclusions capture the former scanner's behavior, including
// directory pruning, leading !, escapes, and stepped/multi-digit brace ranges.
const cases: Array<{ ignore: Array<string>; excluded: Array<string> }> = [
  { ignore: [], excluded: [] },
  { ignore: ['cache'], excluded: ['cache/file.txt'] },
  { ignore: ['cache/'], excluded: [] },
  {
    ignore: ['assets/*', '!assets/keep.txt'],
    excluded: ['assets/app.js', 'assets/app.js.map', 'assets/keep.txt'],
  },
  {
    ignore: ['**/*.{js,map}'],
    excluded: ['assets/app.js', 'assets/app.js.map', 'assets/deep/a.js'],
  },
  { ignore: ['n/{1..3..2}.txt'], excluded: ['n/1.txt', 'n/3.txt'] },
  { ignore: ['n/{10..11}.txt'], excluded: ['n/10.txt', 'n/11.txt'] },
  { ignore: ['docs/{a..b}.html'], excluded: ['docs/a.html', 'docs/b.html'] },
  {
    ignore: ['{assets,{docs,cache}}/**'],
    excluded: paths.filter((path) => /^(assets|docs|cache)\//.test(path)),
  },
  {
    ignore: ['**/!(*.html)'],
    excluded: paths.filter((path) => !path.endsWith('.html')),
  },
  { ignore: ['a\\[1\\].txt'], excluded: ['a[1].txt'] },
  { ignore: ['\\{a,b\\}.txt'], excluded: ['{a,b}.txt'] },
  { ignore: ['{a},b}.txt'], excluded: ['{a},b}.txt'] },
  {
    ignore: ['./assets//**'],
    excluded: paths.filter((path) => path.startsWith('assets/')),
  },
]

for (const [name, scan] of [
  ['CLI', cliScan],
  ['MCP', mcpScan],
] as const) {
  test(`${name} scanner preserves ignore patterns, hidden files, and symlink boundaries`, async () => {
    const root = await fixture()
    try {
      for (const { ignore, excluded } of cases) {
        assert.deepEqual(
          (await scan(root, [...defaults, ...ignore])).sort(),
          paths.filter((path) => !excluded.includes(path)),
          JSON.stringify(ignore),
        )
      }
      assert.deepEqual(
        (await scan(root, [...defaults, join(root, 'assets/**')])).sort(),
        paths.filter((path) => !path.startsWith('assets/')),
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
  test(`${name} scanner rejects excessive expansion before reading a directory`, async () => {
    const missing = join(
      tmpdir(),
      'yeeet-scanner-directory-that-does-not-exist',
    )
    await assert.rejects(
      scan(missing, ['{'.repeat(3000) + 'a,b' + '}'.repeat(3000)]),
      /nested too deeply/,
    )
    await assert.rejects(scan(missing, ['{1..1000000}']), /too many paths/)
    await assert.rejects(
      scan(missing, ['x'.repeat(5000) + '{1..9999}']),
      /too many paths/,
    )
    await assert.rejects(scan(missing, ['{a,b}'.repeat(20)]), /too many paths/)
  })
}

test('CLI and MCP deployment previews send identical manifests to an isolated API', async () => {
  const root = await fixture()
  const config = await mkdtemp(join(tmpdir(), 'yeeet-scan-config-'))
  const requests: Array<{
    method?: string
    url?: string
    body: { dryRun: boolean; files: Array<{ path: string; checksum: string }> }
  }> = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      requests.push({
        method: request.method,
        url: request.url,
        body: JSON.parse(body),
      })
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          summary: {},
          added: [],
          changed: [],
          removed: [],
          unchanged: [],
        }),
      )
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const previousApi = process.env.YEEET_API
  const previousToken = process.env.YEEET_TOKEN
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    process.env.YEEET_API = `http://127.0.0.1:${address.port}`
    process.env.YEEET_TOKEN = 'isolated-scanner-fixture'
    await writeFile(
      join(root, '.yeeetignore'),
      '# comment\r\n n/{1..3..2}.txt \r\n**/*.map\r\n',
    )
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../packages/cli/bin/yeeet.js', import.meta.url)),
        '--json',
        'deploy',
        root,
        '--dry-run',
      ],
      {
        env: {
          ...process.env,
          XDG_CONFIG_HOME: config,
          YEEET_DEPLOY_PASSWORD: '',
        },
      },
    )
    await deployStaticPath({ path: root, dryRun: true })
    assert.equal(requests.length, 2)
    for (const request of requests) {
      assert.equal(request.method, 'POST')
      assert.equal(request.url, '/api/v1/deployments')
      assert.equal(request.body.dryRun, true)
      assert.deepEqual(
        request.body.files.map((file) => file.path),
        paths.filter(
          (path) => !['n/1.txt', 'n/3.txt', 'assets/app.js.map'].includes(path),
        ),
      )
      assert.ok(
        request.body.files.every(
          (file) =>
            file.checksum ===
            createHash('sha256').update('fixture').digest('hex'),
        ),
      )
    }
    assert.deepEqual(requests[0].body.files, requests[1].body.files)
    await writeFile(
      join(root, '.yeeetignore'),
      '{'.repeat(3000) + 'a,b' + '}'.repeat(3000),
    )
    await assert.rejects(
      deployStaticPath({ path: root, dryRun: true }),
      /nested too deeply/,
    )
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        [
          fileURLToPath(
            new URL('../packages/cli/bin/yeeet.js', import.meta.url),
          ),
          '--json',
          'deploy',
          root,
          '--dry-run',
        ],
        {
          env: { ...process.env, XDG_CONFIG_HOME: config },
        },
      ),
      /nested too deeply/,
    )
    assert.equal(requests.length, 2)
  } finally {
    if (previousApi === undefined) delete process.env.YEEET_API
    else process.env.YEEET_API = previousApi
    if (previousToken === undefined) delete process.env.YEEET_TOKEN
    else process.env.YEEET_TOKEN = previousToken
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
    await rm(config, { recursive: true, force: true })
  }
})

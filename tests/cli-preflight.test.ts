import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const cli = fileURLToPath(
  new URL('../packages/cli/bin/yeeet.js', import.meta.url),
)
test('CLI check runs offline, honors ignores/symlinks, and reports only metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeeet-check-'))
  const outside = mkdtempSync(join(tmpdir(), 'yeeet-outside-'))
  try {
    writeFileSync(join(directory, 'index.html'), '<html>fixture</html>')
    writeFileSync(join(directory, '.env'), 'do-not-print-this-test-content')
    writeFileSync(join(directory, '.yeeetignore'), '.env\n')
    writeFileSync(join(outside, 'private.txt'), 'outside fixture')
    symlinkSync(join(outside, 'private.txt'), join(directory, 'linked.txt'))
    const run = (...args: Array<string>) =>
      spawnSync(
        process.execPath,
        [cli, '--json', 'check', directory, ...args],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_CONFIG_HOME: directory,
            YEEET_API: 'http://127.0.0.1:1',
            YEEET_TOKEN: '',
          },
        },
      )
    const passing = run()
    assert.equal(passing.status, 0, passing.stderr)
    assert.deepEqual(
      JSON.parse(passing.stdout).files.map((f: { path: string }) => f.path),
      ['index.html'],
    )
    writeFileSync(join(directory, '.yeeetignore'), '')
    const privateResult = run()
    assert.equal(privateResult.status, 1)
    assert.equal(
      JSON.parse(privateResult.stdout).errors[0].code,
      'private_files',
    )
    assert.ok(!privateResult.stdout.includes('do-not-print-this-test-content'))
    writeFileSync(join(directory, '.yeeetignore'), '.env\n')
    writeFileSync(join(directory, 'app.js.map'), '{}')
    assert.equal(run().status, 0)
    assert.equal(run('--strict').status, 1)
    assert.equal(run('--max-bytes', '1').status, 1)
    assert.equal(run('--max-bytes', 'NaN').status, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
test('CLI deployment preview sends the selected static-routing mode', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeeet-dryrun-'))
  let received: { spaFallback?: boolean; dryRun?: boolean } = {}
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => {
      received = JSON.parse(body)
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
  try {
    writeFileSync(join(directory, 'index.html'), 'fixture')
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    await promisify(execFile)(
      process.execPath,
      [cli, '--json', 'deploy', directory, '--static', '--dry-run'],
      {
        env: {
          ...process.env,
          XDG_CONFIG_HOME: directory,
          YEEET_API: `http://127.0.0.1:${address.port}`,
          YEEET_TOKEN: 'local-fixture-token',
          YEEET_DEPLOY_PASSWORD: '',
        },
      },
    )
    assert.equal(received.spaFallback, false)
    assert.equal(received.dryRun, true)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})

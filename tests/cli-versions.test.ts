import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const cli = fileURLToPath(
  new URL('../packages/cli/bin/yeeet.js', import.meta.url),
)
test('CLI version history encodes filters, preserves cursors, and reports empty pages', async () => {
  const requests: Array<URL> = []
  const cursor = 'opaque+/=cursor'
  const server = createServer((request, response) => {
    requests.push(new URL(request.url ?? '/', 'http://localhost'))
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        site: { url: 'https://demo.site.example.com' },
        versions: [],
        nextCursor: cursor,
      }),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const run = (...args: Array<string>) =>
      promisify(execFile)(
        process.execPath,
        [cli, 'versions', 'demo', ...args],
        {
          env: {
            ...process.env,
            YEEET_API: `http://127.0.0.1:${address.port}`,
            YEEET_TOKEN: 'fixture-token',
          },
        },
      )
    const result = await run(
      '--search',
      ' launch & fix ',
      '--status',
      'failed',
      '--cursor',
      cursor,
      '--json',
    )
    assert.equal(JSON.parse(result.stdout).nextCursor, cursor)
    assert.equal(requests[0].searchParams.get('q'), 'launch & fix')
    assert.equal(requests[0].searchParams.get('status'), 'failed')
    assert.equal(requests[0].searchParams.get('cursor'), cursor)
    const human = (await run()).stdout
    assert.ok(human.includes('No versions match'))
    assert.ok(human.includes(`--cursor ${cursor}`))
    const count = requests.length
    await assert.rejects(run('--status', 'unknown'), /--status must be/)
    await assert.rejects(run('--search', 'x'.repeat(201)), /at most 200/)
    await assert.rejects(run('--cursor', 'x'.repeat(601)), /too long/)
    assert.equal(requests.length, count)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

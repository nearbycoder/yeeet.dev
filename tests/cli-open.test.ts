import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const cli = fileURLToPath(
  new URL('../packages/cli/bin/yeeet.js', import.meta.url),
)
test('CLI open prints live/version URLs and rejects unsafe or unready destinations', async () => {
  let target = 'https://v-example.site.example.com',
    status = 'ready'
  const paths: Array<string> = []
  const server = createServer((request, response) => {
    paths.push(request.url ?? '')
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify(
        request.url?.endsWith('/versions')
          ? {
              site: {
                url: 'https://demo.site.example.com',
                activeDeploymentId: 'fixture-version',
              },
            }
          : { version: { id: 'fixture-version', url: target, status } },
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const run = (...args: Array<string>) =>
      promisify(execFile)(process.execPath, [cli, ...args], {
        env: {
          ...process.env,
          YEEET_API: `http://127.0.0.1:${address.port}`,
          YEEET_TOKEN: 'fixture-token',
        },
      })
    assert.equal(
      (await run('open', 'demo', '--print')).stdout.trim(),
      'https://demo.site.example.com/',
    )
    assert.equal(
      JSON.parse((await run('open', 'demo', 'aaaaaaaa', '--json')).stdout).url,
      'https://v-example.site.example.com/',
    )
    assert.ok(paths.includes('/api/v1/sites/demo/versions/aaaaaaaa'))
    target = 'javascript:alert(1)'
    await assert.rejects(
      run('open', 'demo', 'aaaaaaaa', '--print'),
      /invalid site URL/,
    )
    target = 'https://example.com'
    status = 'uploading'
    await assert.rejects(
      run('open', 'demo', 'aaaaaaaa', '--print'),
      /not ready/,
    )
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

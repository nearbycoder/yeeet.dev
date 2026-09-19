import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { deployCommand, shellQuote } from '../src/lib/deploy-command'

test('CLI recipe quotes shell input and never embeds a password', () => {
  const hostile = "a'$(printf bad);b"
  assert.equal(
    execFileSync('bash', ['-c', `printf %s ${shellQuote(hostile)}`], {
      encoding: 'utf8',
    }),
    hostile,
  )
  const command = deployCommand('https://example.com', {
    slug: 'demo',
    channel: 'staging',
    spaFallback: false,
    privateDeploy: true,
  })
  assert.ok(command.includes('--static'))
  assert.ok(command.includes('--dry-run'))
  assert.ok(command.includes('--channel'))
  assert.ok(command.includes('${YEEET_DEPLOY_PASSWORD:?'))
  assert.throws(() =>
    execFileSync('bash', ['-c', `unset YEEET_DEPLOY_PASSWORD; ${command}`], {
      stdio: 'pipe',
    }),
  )
  assert.ok(
    !deployCommand('https://example.com', {
      slug: '',
      channel: '',
      spaFallback: true,
      privateDeploy: false,
    }).includes('--password'),
  )
})

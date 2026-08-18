import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveVersion } from '../packages/mcp/bin/yeeet-mcp.js'

test('resolves exact, prefixed, and live versions for MCP tools', () => {
  const versions = [
    { id: 'aaaaaaaa-1111-2222-3333-444444444444', current: false },
    { id: 'bbbbbbbb-1111-2222-3333-444444444444', current: true },
  ]
  assert.equal(resolveVersion(versions)?.id, versions[1].id)
  assert.equal(resolveVersion(versions, 'aaaaaaaa')?.id, versions[0].id)
  assert.throws(() => resolveVersion(versions, 'cccccccc'), /not found/i)
  assert.throws(
    () =>
      resolveVersion(
        [
          ...versions,
          { id: 'aaaaaaaa-5555-6666-7777-888888888888', current: false },
        ],
        'aaaaaaaa',
      ),
    /ambiguous/i,
  )
})

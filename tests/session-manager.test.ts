import assert from 'node:assert/strict'
import test from 'node:test'
import { auth } from '../src/lib/auth'
import { db } from '../src/db'
import {
  listBrowserSessions,
  revokeBrowserSession,
} from '../src/server/session-manager'

test('session list omits tokens and revocation only targets another owned session', async (t) => {
  const now = new Date(),
    current = {
      id: 'current',
      userId: 'owner',
      token: 'never-return-current',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60000),
    },
    other = { ...current, id: 'other', token: 'never-return-other' }
  t.mock.method(auth.api, 'getSession', async () => ({
    user: { id: 'owner' },
    session: current,
  }))
  t.mock.method(db.query.user, 'findFirst', async () => ({
    id: 'owner',
    banned: false,
  }))
  t.mock.method(auth.api, 'listSessions', async () => [other, current])
  let revoked = ''
  t.mock.method(
    auth.api,
    'revokeSession',
    async (input: { body: { token: string } }) => {
      revoked = input.body.token
    },
  )
  const request = new Request('http://localhost/dashboard/settings', {
    headers: { cookie: 'local-test' },
  })
  const result = await listBrowserSessions(request)
  assert.equal(result.sessions[0].current, true)
  assert.equal(JSON.stringify(result).includes('never-return'), false)
  await assert.rejects(
    revokeBrowserSession(request, { action: 'one', id: 'current' }),
    /Sign out/,
  )
  await assert.rejects(
    revokeBrowserSession(request, { action: 'one', id: 'foreign' }),
    /not found/,
  )
  assert.equal(revoked, '')
  await revokeBrowserSession(request, { action: 'one', id: 'other' })
  assert.equal(revoked, other.token)
  let all = false
  t.mock.method(auth.api, 'revokeOtherSessions', async () => {
    all = true
  })
  await revokeBrowserSession(request, { action: 'others' })
  assert.equal(all, true)
})
test('API keys and bearer headers cannot authorize the browser session manager', async (t) => {
  let headers: Headers | undefined
  t.mock.method(auth.api, 'getSession', async (input: { headers: Headers }) => {
    headers = input.headers
    return null
  })
  await assert.rejects(
    listBrowserSessions(
      new Request('http://localhost', {
        headers: { authorization: 'Bearer secret', 'x-api-key': 'secret' },
      }),
    ),
    /Log in/,
  )
  assert.equal(headers?.has('authorization'), false)
  assert.equal(headers.has('x-api-key'), false)
})

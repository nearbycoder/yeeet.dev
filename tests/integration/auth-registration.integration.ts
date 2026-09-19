import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { after, test } from 'node:test'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../src/db'
import { invitations, user } from '../../src/db/schema'
import { hashInvitationCode } from '../../src/server/invitations'

after(() => db.$client.end())
test('registration and bootstrap do not grant admin to an unverified allowlisted address', async () => {
  const id = randomUUID(),
    verifiedId = randomUUID()
  const email = `unverified-${id}@example.com`,
    verifiedEmail = `verified-${id}@example.com`
  const invitation = `local-invitation-${id}`
  process.env.BETTER_AUTH_SECRET =
    'local-registration-test-secret-at-least-32-characters'
  process.env.BETTER_AUTH_URL = 'http://localhost:3002'
  process.env.ADMIN_EMAILS = `${email},${verifiedEmail}`
  const { auth } = await import('../../src/lib/auth')
  await db.insert(invitations).values({
    id,
    codeHash: hashInvitationCode(invitation),
    codeHint: 'fixture',
    label: 'Local fixture',
  })
  try {
    const signup = await auth.handler(
      new Request('http://localhost:3002/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3002',
          'content-type': 'application/json',
          'x-yeeet-invitation': invitation,
        },
        body: JSON.stringify({
          name: 'Local fixture',
          email,
          password: 'Local-registration-fixture-2026',
          emailVerified: true,
        }),
      }),
    )
    assert.equal(signup.status, 200)
    const created = await db.query.user.findFirst({
      where: eq(user.email, email),
    })
    assert.equal(created?.emailVerified, false)
    assert.equal(created.role, 'user')
    await db.insert(user).values({
      id: verifiedId,
      name: 'Verified fixture',
      email: verifiedEmail,
      emailVerified: true,
      role: 'user',
    })
    execFileSync(process.execPath, ['scripts/bootstrap-admin.mjs'], {
      env: { ...process.env, INITIAL_INVITATION_CODE: '' },
      encoding: 'utf8',
    })
    assert.equal(
      (await db.query.user.findFirst({ where: eq(user.email, email) }))?.role,
      'user',
    )
    assert.equal(
      (await db.query.user.findFirst({ where: eq(user.id, verifiedId) }))?.role,
      'admin',
    )
  } finally {
    await db.delete(user).where(inArray(user.email, [email, verifiedEmail]))
    await db.delete(invitations).where(eq(invitations.id, id))
  }
})

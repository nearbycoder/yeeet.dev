import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is required.')

const adminEmails = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)
const invitationCode = process.env.INITIAL_INVITATION_CODE?.trim()
const pool = new pg.Pool({ connectionString, max: 1 })

try {
  let promoted = 0
  if (adminEmails.length) {
    const result = await pool.query(
      "update \"user\" set role = 'admin', updated_at = now() where lower(email) = any($1::text[]) and role <> 'admin'",
      [adminEmails],
    )
    promoted = result.rowCount ?? 0
  }

  let invitationSeeded = false
  if (invitationCode) {
    const codeHash = createHash('sha256').update(invitationCode).digest('hex')
    const result = await pool.query(
      `insert into invitations
        (id, code_hash, code_hint, label, active, use_count, created_at)
       values ($1, $2, $3, 'Bootstrap access', true, 0, now())
       on conflict (code_hash) do nothing`,
      [randomUUID(), codeHash, `…${invitationCode.slice(-6)}`],
    )
    invitationSeeded = (result.rowCount ?? 0) > 0
  }

  console.log(
    `Admin bootstrap complete (${promoted} promoted, invitation ${invitationSeeded ? 'seeded' : 'current'}).`,
  )
} finally {
  await pool.end()
}

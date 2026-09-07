import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { HttpError } from './http'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

const schema = z.object({
  t: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/),
  id: z.string().min(1).max(100),
  scope: z.string(),
})
function scopeHash(scope: unknown) {
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex')
}
export function cursorTime(column: AnyPgColumn) {
  return sql<string>`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`
}
export function encodeCursor(
  row: { cursorTime: string; id: string },
  scope: unknown,
) {
  return Buffer.from(
    JSON.stringify({ t: row.cursorTime, id: row.id, scope: scopeHash(scope) }),
  ).toString('base64url')
}
export function decodeCursor(value: string | undefined, scope: unknown) {
  if (!value) return null
  try {
    if (value.length > 600) throw new Error()
    const parsed = schema.parse(
      JSON.parse(Buffer.from(value, 'base64url').toString()),
    )
    if (
      parsed.scope !== scopeHash(scope) ||
      !Number.isFinite(Date.parse(parsed.t))
    )
      throw new Error()
    return parsed
  } catch {
    throw new HttpError(
      400,
      'This page cursor is invalid for these filters. Start from the first page.',
      'invalid_cursor',
    )
  }
}
export function afterCursor(
  time: AnyPgColumn,
  id: AnyPgColumn,
  cursor: ReturnType<typeof decodeCursor>,
) {
  return cursor
    ? sql`(${time}, ${id}) < (${cursor.t}::timestamp, ${cursor.id})`
    : undefined
}
export function searchPattern(value: string) {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`
}

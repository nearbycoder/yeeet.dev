import { desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { apikey } from '#/db/schema'

export async function listAccountKeys(userId: string) {
  const keys = await db
    .select({
      id: apikey.id,
      name: apikey.name,
      start: apikey.start,
      enabled: apikey.enabled,
      expiresAt: apikey.expiresAt,
      lastRequest: apikey.lastRequest,
      requestCount: apikey.requestCount,
      createdAt: apikey.createdAt,
    })
    .from(apikey)
    .where(eq(apikey.referenceId, userId))
    .orderBy(desc(apikey.createdAt))
  return keys.map((key) => ({
    ...key,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastRequest: key.lastRequest?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  }))
}

import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { storageCleanupJobs } from '#/db/schema'
import { deleteStoredPrefix } from './storage'
import { purgeBackendForPrefix } from './backend-runtime'

// Metadata deletion enqueues this job in the same transaction. A storage
// outage must never resurrect a version or discard the remaining cleanup work.
export async function attemptStorageCleanup(id: string, prefix: string) {
  await purgeBackendForPrefix(prefix)
  try {
    const deletedObjects = await deleteStoredPrefix(prefix)
    await db.delete(storageCleanupJobs).where(eq(storageCleanupJobs.id, id))
    return { deletedObjects, cleanupPending: false }
  } catch {
    return { deletedObjects: 0, cleanupPending: true }
  }
}

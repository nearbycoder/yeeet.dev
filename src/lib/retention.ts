import { z } from 'zod'

export const retentionSchema = z.object({
  slug: z.string().min(1),
  keepCount: z.number().int().min(1).max(1000),
  minAgeDays: z.number().int().min(1).max(3650),
})
export const retentionSaveSchema = retentionSchema.extend({
  enabled: z.boolean(),
})
export const retentionExecuteSchema = retentionSchema.extend({
  expectedIds: z.array(z.string().min(1)).min(1).max(50),
})
type Version = {
  id: string
  status: string
  createdAt: Date | string
  totalBytes: number
}
export function retentionCandidates<T extends Version>(
  versions: Array<T>,
  protectedIds: Set<string>,
  keepCount: number,
  minAgeDays: number,
  now = Date.now(),
) {
  const completed = versions
    .filter(
      (version) => version.status === 'ready' || version.status === 'failed',
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        a.id.localeCompare(b.id),
    )
  const keep = new Set(
    completed.slice(0, keepCount).map((version) => version.id),
  )
  return completed
    .filter(
      (version) =>
        !keep.has(version.id) &&
        !protectedIds.has(version.id) &&
        new Date(version.createdAt).getTime() < now - minAgeDays * 86400000,
    )
    .slice(0, 50)
}

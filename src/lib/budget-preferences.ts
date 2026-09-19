import { z } from 'zod'

export const budgetPreferencesSchema = z.object({
  fileKiB: z.number().int().min(1).max(1048576),
  totalMiB: z.number().int().min(1).max(1048576),
})
export const defaultBudgetPreferences = { fileKiB: 512, totalMiB: 10 }
export function budgetStorageKey(userId: string, slug: string) {
  return `yeeet:asset-budget:v1:${encodeURIComponent(userId)}:${encodeURIComponent(slug)}`
}

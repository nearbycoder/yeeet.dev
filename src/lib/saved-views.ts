import { z } from 'zod'
import { siteSearchSchema } from './pagination'

export const savedFilterSchema = siteSearchSchema.omit({ cursor: true })
export const savedViewsSchema = z
  .array(
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(60),
      filters: savedFilterSchema,
    }),
  )
  .max(12)
export type SavedView = z.infer<typeof savedViewsSchema>[number]
export function saveView(
  views: Array<SavedView>,
  name: string,
  filters: unknown,
) {
  const cleanName = z.string().trim().min(1).max(60).parse(name)
  const existing = views.find(
    (view) => view.name.toLowerCase() === cleanName.toLowerCase(),
  )
  const next = {
    id: existing?.id ?? crypto.randomUUID(),
    name: cleanName,
    filters: savedFilterSchema.parse(filters),
  }
  return savedViewsSchema.parse(
    existing
      ? views.map((view) => (view.id === existing.id ? next : view))
      : [...views, next],
  )
}

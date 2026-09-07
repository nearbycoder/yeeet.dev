import { z } from 'zod'

export const siteNotesSchema = z.object({
  slug: z.string().min(1).max(63),
  notes: z.string().max(4000),
  expectedNotes: z.string().max(4000),
})

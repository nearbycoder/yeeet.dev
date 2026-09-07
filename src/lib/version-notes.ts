import { z } from 'zod'

export const versionNotesSchema = z.object({
  slug: z.string().min(1).max(63),
  version: z.string().min(8).max(36),
  label: z.string().max(60),
  notes: z.string().max(2000),
  expectedLabel: z.string().max(60),
  expectedNotes: z.string().max(2000),
})

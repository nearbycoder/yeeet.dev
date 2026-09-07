import { z } from 'zod'

export const storageSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['bytes', 'versions', 'name']).default('bytes'),
  page: z.number().int().min(0).max(10000).default(0),
})

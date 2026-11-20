import { z } from 'zod'

export const storageSearchSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  sort: z.enum(['bytes', 'versions', 'name']).catch('bytes'),
  page: z.coerce.number().int().min(0).max(10000).catch(0),
})

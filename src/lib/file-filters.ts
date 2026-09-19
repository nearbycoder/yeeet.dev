import { z } from 'zod'

export const fileFilterSearchSchema = z.object({
  fileQuery: z.string().max(200).optional(),
  fileType: z
    .enum(['Images', 'JavaScript', 'Stylesheets', 'HTML', 'Fonts', 'Other'])
    .optional(),
  fileOrder: z.enum(['path', 'largest', 'smallest']).optional(),
})
export type FileFilters = z.infer<typeof fileFilterSearchSchema>

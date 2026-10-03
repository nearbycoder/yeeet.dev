import { z } from 'zod'

export const fileFilterSearchSchema = z.object({
  fileQuery: z.string().max(200).optional(),
  fileType: z
    .enum(['Images', 'JavaScript', 'Stylesheets', 'HTML', 'Fonts', 'Other'])
    .optional(),
  fileOrder: z.enum(['path', 'largest', 'smallest']).optional(),
  fileDirectory: z.string().max(1000).optional(),
  fileMin: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1e9)
    .optional()
    .catch(undefined),
  fileMax: z.coerce
    .number()
    .finite()
    .min(0)
    .max(1e9)
    .optional()
    .catch(undefined),
})
export type FileFilters = z.infer<typeof fileFilterSearchSchema>

import { z } from 'zod'

export const organizationSchema = z.object({
  slug: z.string().min(1),
  favorite: z.boolean(),
  project: z.string().trim().max(60),
  tags: z
    .array(z.string().trim().min(1).max(30))
    .max(12)
    .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
})
export const emptyOrganization = {
  favorite: false,
  project: '',
  tags: [] as Array<string>,
}

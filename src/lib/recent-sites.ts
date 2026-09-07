import { z } from 'zod'

export const recentSitesSchema = z
  .array(
    z.object({
      slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
      visitedAt: z.number().finite().nonnegative(),
    }),
  )
  .max(8)
export function rememberSite(items: unknown, slug: string, now = Date.now()) {
  const previous = recentSitesSchema.parse(items)
  return recentSitesSchema.parse(
    [
      { slug, visitedAt: now },
      ...previous.filter((item) => item.slug !== slug),
    ].slice(0, 8),
  )
}
export const recentSitesKey = (userId: string) =>
  `yeeet:recent-sites:v1:${userId}`

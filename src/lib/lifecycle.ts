import { z } from 'zod'

export function previewHasExpired(
  expiresAt: Date | string | null,
  current: boolean,
  now = Date.now(),
) {
  return !current && expiresAt !== null && new Date(expiresAt).getTime() <= now
}
export const healthSchema = z.object({
  slug: z.string().min(1),
  enabled: z.boolean(),
  path: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^\/(?!\/)[^\\?#]*$/),
  expectedStatus: z.number().int().min(200).max(599),
})
export const expirySchema = z.object({
  slug: z.string().min(1),
  version: z.string().min(1),
  hours: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(24),
    z.literal(168),
    z.literal(720),
  ]),
})

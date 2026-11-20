import { z } from 'zod'

export const pageSearchSchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  cursor: z.string().max(600).optional().catch(undefined),
})
export const siteSearchSchema = pageSearchSchema.extend({
  status: z.enum(['all', 'live', 'inactive']).optional().catch(undefined),
  group: z.string().max(60).optional().catch(undefined),
  favorites: z.boolean().optional().catch(undefined),
})
export const versionSearchSchema = pageSearchSchema.extend({
  status: z
    .enum(['all', 'ready', 'uploading', 'failed'])
    .optional()
    .catch(undefined),
})
export const workspaceSearchSchema = z.object({
  workspace: z.string().optional().catch(undefined),
  site: z.string().optional().catch(undefined),
  version: z.string().optional().catch(undefined),
  versionCursor: z.string().max(600).optional().catch(undefined),
  feedbackCursor: z.string().max(600).optional().catch(undefined),
  feedbackQuery: z.string().trim().max(200).optional().catch(undefined),
  feedbackStatus: z
    .enum(['all', 'open', 'resolved'])
    .optional()
    .catch(undefined),
})

import { z } from 'zod'

export const pageSearchSchema = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().max(600).optional(),
})
export const siteSearchSchema = pageSearchSchema.extend({
  status: z.enum(['all', 'live', 'inactive']).optional(),
  group: z.string().max(60).optional(),
  favorites: z.boolean().optional(),
})
export const versionSearchSchema = pageSearchSchema.extend({
  status: z.enum(['all', 'ready', 'uploading', 'failed']).optional(),
})
export const workspaceSearchSchema = z.object({
  workspace: z.string().optional(),
  site: z.string().optional(),
  version: z.string().optional(),
  versionCursor: z.string().max(600).optional(),
  feedbackCursor: z.string().max(600).optional(),
  feedbackQuery: z.string().trim().max(200).optional(),
  feedbackStatus: z.enum(['all', 'open', 'resolved']).optional(),
})

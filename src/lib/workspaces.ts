import { z } from 'zod'

export type WorkspaceRole = 'owner' | 'editor' | 'viewer'
export function canEditWorkspace(role: string) {
  return role === 'owner' || role === 'editor'
}
const id = z.string().min(1).max(100)
export const workspaceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    action: z.literal('rename'),
    workspace: id,
    name: z.string().trim().min(1).max(80),
  }),
  z.object({ action: z.literal('delete'), workspace: id }),
  z.object({
    action: z.literal('member'),
    workspace: id,
    email: z.email(),
    role: z.enum(['editor', 'viewer']),
  }),
  z.object({ action: z.literal('remove-member'), workspace: id, userId: id }),
  z.object({
    action: z.literal('site'),
    workspace: id,
    slug: id,
    remove: z.boolean(),
  }),
  z.object({
    action: z.literal('promote'),
    workspace: id,
    slug: id,
    version: id,
  }),
  z.object({
    action: z.literal('comment'),
    workspace: id,
    slug: id,
    version: id,
    body: z.string().trim().min(1).max(4000),
    path: z
      .string()
      .trim()
      .min(1)
      .max(500)
      .regex(/^\/(?!\/)[^\\?#]*$/),
  }),
  z.object({
    action: z.literal('resolve'),
    workspace: id,
    feedbackId: id,
    resolved: z.boolean(),
  }),
  z.object({
    action: z.literal('delete-comment'),
    workspace: id,
    feedbackId: id,
  }),
])

import { z } from 'zod'

const schema = z.object({
  body: z.string().max(4000),
  path: z.string().max(500),
  updatedAt: z.number().finite(),
})
export function parseFeedbackDraft(raw: string | null, now = Date.now()) {
  try {
    const draft = schema.parse(JSON.parse(raw ?? 'null'))
    return draft.body.trim() &&
      draft.updatedAt <= now &&
      draft.updatedAt >= now - 7 * 86400000
      ? draft
      : null
  } catch {
    return null
  }
}
export const feedbackDraftKey = (
  user: string,
  workspace: string,
  version: string,
) =>
  `yeeet:feedback-draft:v1:${[user, workspace, version].map(encodeURIComponent).join(':')}`

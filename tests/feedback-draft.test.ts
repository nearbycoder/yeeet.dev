import assert from 'node:assert/strict'
import test from 'node:test'
import { feedbackDraftKey, parseFeedbackDraft } from '../src/lib/feedback-draft'

test('feedback drafts expire, reject malformed records and separate account/workspace/version scopes', () => {
  const now = Date.now(),
    raw = JSON.stringify({ body: 'Review', path: '/about', updatedAt: now })
  assert.equal(parseFeedbackDraft(raw, now)?.path, '/about')
  assert.equal(parseFeedbackDraft(raw, now + 8 * 86400000), null)
  assert.equal(parseFeedbackDraft(raw, now - 1), null)
  assert.equal(parseFeedbackDraft('{'), null)
  assert.notEqual(
    feedbackDraftKey('a:b', 'c', 'd'),
    feedbackDraftKey('a', 'b:c', 'd'),
  )
  assert.notEqual(
    feedbackDraftKey('a', 'b', 'c'),
    feedbackDraftKey('a', 'b', 'd'),
  )
})

import { useEffect, useState } from 'react'
import { updateWorkspace } from '#/server/functions'
import { useConsoleMutation } from '#/lib/console-request'
import { feedbackDraftKey, parseFeedbackDraft } from '#/lib/feedback-draft'

export function FeedbackComposer({
  userId,
  workspace,
  slug,
  version,
}: {
  userId: string
  workspace: string
  slug: string
  version: string
}) {
  const [draft, setDraft] = useState({ body: '', path: '/' }),
    [loaded, setLoaded] = useState(false),
    [recovery, setRecovery] =
      useState<ReturnType<typeof parseFeedbackDraft>>(null),
    [storageError, setStorageError] = useState('')
  const mutation = useConsoleMutation(),
    key = feedbackDraftKey(userId, workspace, version)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      const saved = parseFeedbackDraft(raw)
      setRecovery(saved)
      if (raw && !saved) localStorage.removeItem(key)
    } catch {
      setStorageError(
        'Browser draft storage is unavailable. Keep this page open.',
      )
    }
    setLoaded(true)
  }, [key])
  function persist(next: typeof draft) {
    setDraft(next)
    try {
      if (next.body.trim())
        localStorage.setItem(
          key,
          JSON.stringify({ ...next, updatedAt: Date.now() }),
        )
      else localStorage.removeItem(key)
      setStorageError('')
    } catch {
      setStorageError(
        'Browser draft storage is unavailable. Keep this page open.',
      )
    }
  }
  return (
    <section aria-label="Write version feedback">
      {recovery ? (
        <div className="console-item">
          <p>
            A saved draft for this version is available from{' '}
            {new Date(recovery.updatedAt).toLocaleString()}.
          </p>
          <div className="console-actions">
            <button
              className="button button-paper"
              onClick={() => {
                setDraft({ body: recovery.body, path: recovery.path })
                setRecovery(null)
              }}
            >
              Restore feedback draft
            </button>
            <button
              className="button button-paper"
              onClick={() => {
                persist({ body: '', path: '/' })
                setRecovery(null)
              }}
            >
              Discard feedback draft
            </button>
          </div>
        </div>
      ) : null}
      <form
        className="site-page-stack"
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(async () => {
            await updateWorkspace({
              data: { action: 'comment', workspace, slug, version, ...draft },
            })
            setDraft({ body: '', path: '/' })
            try {
              localStorage.removeItem(key)
            } catch {
              setStorageError(
                'Feedback was posted, but its browser draft could not be cleared. Discard it if it reappears.',
              )
            }
          }, 'Feedback added.')
        }}
      >
        <label className="console-field">
          Page path
          <input
            disabled={!loaded || Boolean(recovery) || mutation.busy}
            value={draft.path}
            onChange={(event) =>
              persist({ ...draft, path: event.target.value })
            }
            required
            maxLength={500}
            placeholder="/pricing"
          />
        </label>
        <label className="console-field">
          Feedback
          <textarea
            disabled={!loaded || Boolean(recovery) || mutation.busy}
            value={draft.body}
            onChange={(event) =>
              persist({ ...draft, body: event.target.value })
            }
            required
            maxLength={4000}
            rows={3}
            placeholder="What should change in this build?"
          />
        </label>
        <p role="status">
          {storageError ||
            (draft.body.trim()
              ? 'Draft saved in this browser for seven days.'
              : 'Unsent feedback is saved in this browser for seven days.')}
        </p>
        <div className="console-actions">
          <button
            className="button button-paper"
            disabled={!loaded || Boolean(recovery) || mutation.busy}
          >
            Add feedback
          </button>
          {draft.body ? (
            <button
              type="button"
              className="button button-paper"
              disabled={mutation.busy}
              onClick={() => persist({ body: '', path: '/' })}
            >
              Discard current draft
            </button>
          ) : null}
        </div>
      </form>
      {mutation.error ? (
        <p role="alert" className="form-error">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? <p role="status">{mutation.notice}</p> : null}
    </section>
  )
}

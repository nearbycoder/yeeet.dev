import { useState } from 'react'
import { updateFeedback } from '#/server/functions'
import { useConsoleMutation } from '#/lib/console-request'

export function FeedbackEditor({
  workspace,
  comment,
}: {
  workspace: string
  comment: { id: string; body: string; path: string }
}) {
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(''),
    [path, setPath] = useState('/'),
    [base, setBase] = useState(comment)
  const mutation = useConsoleMutation()
  return (
    <div>
      {editing ? (
        <form
          className="site-page-stack"
          onSubmit={(event) => {
            event.preventDefault()
            void mutation.run(async () => {
              await updateFeedback({
                data: {
                  workspace,
                  id: comment.id,
                  body,
                  path,
                  expectedBody: base.body,
                  expectedPath: base.path,
                },
              })
              setEditing(false)
            }, 'Feedback updated.')
          }}
        >
          <label className="console-field">
            Edit page path
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              maxLength={500}
              required
            />
          </label>
          <label className="console-field">
            Edit feedback
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={4000}
              rows={4}
              required
            />
          </label>
          <div className="console-actions">
            <button className="button button-ink" disabled={mutation.busy}>
              Save feedback edit
            </button>
            <button
              type="button"
              className="button button-paper"
              disabled={mutation.busy}
              onClick={() => setEditing(false)}
            >
              Cancel feedback edit
            </button>
          </div>
        </form>
      ) : (
        <button
          className="button button-paper"
          onClick={() => {
            setBase(comment)
            setBody(comment.body)
            setPath(comment.path)
            setEditing(true)
          }}
        >
          Edit feedback
        </button>
      )}
      {mutation.error ? (
        <p role="alert" className="form-error">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? <p role="status">{mutation.notice}</p> : null}
    </div>
  )
}

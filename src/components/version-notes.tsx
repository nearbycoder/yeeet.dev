import { useState } from 'react'
import { updateVersionNotes } from '#/server/functions'
import { useConsoleMutation } from '#/lib/console-request'

export function VersionNotes({
  slug,
  version,
}: {
  slug: string
  version: { id: string; releaseLabel: string; releaseNotes: string }
}) {
  const [label, setLabel] = useState(version.releaseLabel),
    [notes, setNotes] = useState(version.releaseNotes)
  const [base, setBase] = useState({
    label: version.releaseLabel,
    notes: version.releaseNotes,
  })
  const mutation = useConsoleMutation()
  return (
    <details className="console-item">
      <summary>
        Release label and notes
        {version.releaseLabel ? `: ${version.releaseLabel}` : ''}
      </summary>
      <p>
        Labels and notes describe this exact version and are visible to its
        workspace reviewers.
      </p>
      <form
        className="site-page-stack"
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(async () => {
            setBase(
              await updateVersionNotes({
                data: {
                  slug,
                  version: version.id,
                  label,
                  notes,
                  expectedLabel: base.label,
                  expectedNotes: base.notes,
                },
              }),
            )
          }, 'Release notes saved.')
        }}
      >
        <label className="console-field">
          Release label
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            placeholder="For example, September launch"
          />
        </label>
        <label className="console-field">
          Release notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            rows={5}
          />
        </label>
        <p>{notes.length}/2000 characters</p>
        <div className="console-actions">
          <button
            className="button button-ink"
            disabled={
              mutation.busy || (label === base.label && notes === base.notes)
            }
          >
            Save release notes
          </button>
          <button
            type="button"
            className="button button-paper"
            disabled={mutation.busy}
            onClick={() => {
              setLabel(version.releaseLabel)
              setNotes(version.releaseNotes)
              setBase({
                label: version.releaseLabel,
                notes: version.releaseNotes,
              })
            }}
          >
            Reset release notes
          </button>
        </div>
      </form>
      {mutation.error ? (
        <p role="alert" className="form-error">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? <p role="status">{mutation.notice}</p> : null}
    </details>
  )
}

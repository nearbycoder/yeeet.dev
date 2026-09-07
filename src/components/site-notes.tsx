import { useState } from 'react'
import { updateSiteNotes } from '#/server/functions'
import { useConsoleMutation } from '#/lib/console-request'

export function SiteNotes({ slug, notes }: { slug: string; notes: string }) {
  const [draft, setDraft] = useState(notes),
    [base, setBase] = useState(notes)
  const mutation = useConsoleMutation()
  return (
    <section className="panel site-page-panel">
      <h2>Site notes</h2>
      <p>
        Private operational notes for the site owner. Stored as plain text with
        this site.
      </p>
      <form
        className="site-page-stack"
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(async () => {
            const result = await updateSiteNotes({
              data: { slug, notes: draft, expectedNotes: base },
            })
            setBase(result.notes)
          }, 'Site notes saved.')
        }}
      >
        <label className="console-field">
          Notes
          <textarea
            rows={6}
            maxLength={4000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Purpose, release process, ownership, or things to remember…"
          />
        </label>
        <p>
          {draft.length}/4000 characters
          {draft !== base ? ' · Unsaved changes' : ''}
        </p>
        <div className="console-actions">
          <button
            className="button button-ink"
            disabled={mutation.busy || draft === base}
          >
            Save site notes
          </button>
          <button
            type="button"
            className="button button-paper"
            disabled={mutation.busy}
            onClick={() => {
              setDraft(notes)
              setBase(notes)
            }}
          >
            Reset to saved notes
          </button>
        </div>
      </form>
      {mutation.error ? (
        <p className="form-error" role="alert">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? <p role="status">{mutation.notice}</p> : null}
    </section>
  )
}

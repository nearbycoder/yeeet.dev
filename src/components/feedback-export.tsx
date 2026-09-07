import { useState } from 'react'
import { getFeedbackExport } from '#/server/functions'
import { downloadText, toCsv } from '#/lib/download'

export function FeedbackExport({
  workspace,
  slug,
  version,
  q,
  status,
}: {
  workspace: string
  slug: string
  version: string
  q?: string
  status?: 'all' | 'open' | 'resolved'
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  async function save() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await getFeedbackExport({
        data: { workspace, slug, version, q, status },
      })
      downloadText(
        `${result.site}-${result.version}-feedback.csv`,
        toCsv([
          [
            'Site',
            'Version',
            'Comment ID',
            'Author',
            'Path',
            'Status',
            'Created',
            'Edited',
            'Feedback',
          ],
          ...result.comments.map((comment) => [
            result.site,
            result.version,
            comment.id,
            comment.author ?? 'Former member',
            comment.path,
            comment.resolved ? 'Resolved' : 'Open',
            comment.createdAt,
            comment.editedAt,
            comment.body,
          ]),
        ]),
        'text/csv;charset=utf-8',
      )
      setNotice(
        `Downloaded ${result.comments.length} comments.${result.truncated ? ' Export limited to the newest 1,000 matches; narrow the filters for more specific results.' : ''}`,
      )
    } catch {
      setError('Could not export feedback. Check your access and try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="console-item">
      <button
        className="button button-paper"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? 'Preparing feedback…' : 'Export filtered feedback CSV'}
      </button>
      <p>
        Includes matching comments beyond this page, up to the newest 1,000.
        Exports may contain team discussion.
      </p>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  )
}

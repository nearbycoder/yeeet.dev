import { useState } from 'react'
import { useConsoleMutation } from '#/lib/console-request'
import { updateSiteOrganization } from '#/server/functions'

export function SiteOrganization({
  slug,
  organization,
}: {
  slug: string
  organization: { favorite: boolean; project: string; tags: Array<string> }
}) {
  const [favorite, setFavorite] = useState(organization.favorite)
  const [project, setProject] = useState(organization.project)
  const [tags, setTags] = useState(organization.tags.join(', '))
  const mutation = useConsoleMutation()
  return (
    <section className="panel site-page-panel">
      <h2>Organize this site</h2>
      <p>Your favorites, tags, and project groups follow you across devices.</p>
      <form
        className="console-form-grid"
        onSubmit={(event) => {
          event.preventDefault()
          void mutation.run(() =>
            updateSiteOrganization({
              data: {
                slug,
                favorite,
                project,
                tags: tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              },
            }),
          )
        }}
      >
        <label>
          Project group
          <input
            value={project}
            maxLength={60}
            placeholder="Client work…"
            onChange={(event) => setProject(event.target.value)}
          />
        </label>
        <label>
          Tags, separated by commas
          <input
            value={tags}
            placeholder="docs, production…"
            onChange={(event) => setTags(event.target.value)}
          />
          <small>Up to 12 tags, 30 characters each.</small>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={favorite}
            onChange={(event) => setFavorite(event.target.checked)}
          />
          Favorite site
        </label>
        <button className="button button-ink" disabled={mutation.busy}>
          Save organization
        </button>
      </form>
      {mutation.error ? (
        <p role="alert" className="form-error">
          {mutation.error}
        </p>
      ) : null}
      {mutation.notice ? (
        <p role="status" className="form-success">
          {mutation.notice}
        </p>
      ) : null}
    </section>
  )
}

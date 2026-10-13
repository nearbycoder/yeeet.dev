import { Link } from '@tanstack/react-router'
import type { launchChecklist } from '#/server/launch-checklist'

export function LaunchChecklist({
  slug,
  data,
}: {
  slug: string
  data: Awaited<ReturnType<typeof launchChecklist>>
}) {
  const required = [
    {
      title: 'Ready production version',
      done: data.ready,
      detail: data.activeId
        ? `${data.activeId.slice(0, 8)} is ${data.ready ? 'ready' : 'not ready'}.`
        : 'Publish or promote a ready build.',
      to: '/dashboard/sites/$slug/versions' as const,
    },
    {
      title: 'Root route recorded',
      done: data.ready && data.rootReady,
      detail: data.activeId
        ? `Recorded routing status ${data.rootStatus} for /. ${data.spa ? 'SPA' : 'Static'} routing.`
        : 'Upload an index page or configure a root redirect.',
      to: '/dashboard/sites/$slug/inspect' as const,
    },
  ]
  const optional = [
    {
      title: 'Review access',
      done: Boolean(data.activeId),
      detail: data.activeId
        ? `Current build is ${data.protected ? 'private (password/share link)' : 'public'}. Confirm this matches your intent.`
        : 'Access is configured per build.',
      to: '/dashboard/sites/$slug/sharing' as const,
    },
    {
      title: 'Keep a rollback build',
      done: data.readyVersions > 1,
      detail: `${data.readyVersions} ready versions (excluding expired previews); ${data.pinnedVersions} pinned against cleanup.`,
      to: '/dashboard/sites/$slug/versions' as const,
    },
    {
      title: 'Connect a custom domain',
      done: data.issuedDomains > 0,
      detail: data.issuedDomains
        ? `${data.issuedDomains} domains have recorded issued TLS certificates.`
        : 'Optional: the built-in site hostname is available.',
      to: '/dashboard/sites/$slug/domains' as const,
    },
    {
      title: 'Verify the origin',
      done: data.healthPassed,
      detail: data.healthPassed
        ? 'The current build passed its configured origin check within 15 minutes.'
        : data.healthCheckedAt
          ? `Last check: ${new Date(data.healthCheckedAt).toLocaleString()}. Run again for current evidence.`
          : 'No origin check recorded yet.',
      to: '/dashboard/sites/$slug/lifecycle' as const,
    },
  ]
  const all = [...required, ...optional]
  const doneCount = all.filter((item) => item.done).length
  const requiredDone = required.filter((item) => item.done).length
  return (
    <section
      className="panel site-page-panel launch-panel"
      aria-label="Launch checklist"
    >
      <div className="launch-panel-heading">
        <div>
          <span className="panel-kicker">Preflight</span>
          <h2>Launch checklist</h2>
          <p role="status">
            {requiredDone} of {required.length} deployment checks ready ·{' '}
            {doneCount} of {all.length} overall
          </p>
        </div>
        <div
          className="launch-progress"
          aria-hidden="true"
          style={
            {
              '--progress': `${Math.round((doneCount / all.length) * 100)}%`,
            } as React.CSSProperties
          }
        >
          <span>
            {doneCount}/{all.length}
          </span>
        </div>
      </div>
      <ol className="launch-checklist launch-checklist-required">
        {required.map((item) => (
          <li key={item.title} className={item.done ? 'is-done' : ''}>
            <span className="launch-check" aria-hidden="true">
              {item.done ? '✓' : '!'}
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
            </div>
            <Link
              to={item.to}
              params={{ slug }}
              search={
                item.to.endsWith('/inspect')
                  ? { version: data.activeId ?? undefined }
                  : { q: data.activeId ?? undefined }
              }
              aria-label={`Open ${item.title.toLowerCase()} settings`}
            >
              Open →
            </Link>
          </li>
        ))}
      </ol>
      <h3>Recommended review</h3>
      <ul className="launch-checklist launch-checklist-optional">
        {optional.map((item) => (
          <li key={item.title} className={item.done ? 'is-done' : ''}>
            <span className="launch-check" aria-hidden="true">
              {item.title === 'Review access' ? '↗' : item.done ? '✓' : ''}
            </span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <Link
                to={item.to}
                params={{ slug }}
                search={
                  item.to.endsWith('/sharing')
                    ? { version: data.activeId ?? undefined }
                    : {}
                }
              >
                {item.title} →
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="launch-note">
        Checks use recorded configuration. Open the live site to confirm its
        appearance; DNS, CDN propagation, and object availability are not
        guaranteed by metadata.
      </p>
    </section>
  )
}

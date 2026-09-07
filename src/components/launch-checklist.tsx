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
  return (
    <section className="panel site-page-panel" aria-label="Launch checklist">
      <h2>Launch checklist</h2>
      <p role="status">
        {required.filter((item) => item.done).length} of {required.length}{' '}
        deployment checks ready
      </p>
      <p>
        This checklist uses recorded configuration. Open the live site to
        confirm its appearance and behavior; DNS, CDN propagation and current
        object availability are not guaranteed by metadata.
      </p>
      <ol className="launch-checklist">
        {required.map((item) => (
          <li key={item.title}>
            <strong>
              {item.done ? '✓' : '○'} {item.title}
            </strong>
            <p>{item.detail}</p>
            <Link
              to={item.to}
              params={{ slug }}
              search={
                item.to.endsWith('/inspect')
                  ? { version: data.activeId ?? undefined }
                  : { q: data.activeId ?? undefined }
              }
            >
              Open {item.title.toLowerCase()} settings →
            </Link>
          </li>
        ))}
      </ol>
      <h3>Recommended review</h3>
      <p>
        These steps depend on your launch. A recorded access mode describes
        configuration and still needs your review.
      </p>
      <ul className="launch-checklist">
        {optional.map((item) => (
          <li key={item.title}>
            <strong>
              {item.title === 'Review access' ? '↗' : item.done ? '✓' : '○'}{' '}
              {item.title}
            </strong>
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
          </li>
        ))}
      </ul>
      <Link
        className="button button-coral"
        to="/dashboard"
        search={{ site: slug }}
      >
        Deploy an update
      </Link>
    </section>
  )
}

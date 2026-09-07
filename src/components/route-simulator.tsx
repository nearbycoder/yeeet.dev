import { useState } from 'react'
import { getRouteSimulation } from '#/server/functions'

export function RouteSimulator({
  slug,
  version,
}: {
  slug: string
  version: string
}) {
  const [path, setPath] = useState('/'),
    [result, setResult] = useState<Awaited<
      ReturnType<typeof getRouteSimulation>
    > | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  return (
    <details className="console-item">
      <summary>Simulate a route</summary>
      <p>
        Preview a GET request accepting HTML against this version's recorded
        files and rules. This does not fetch any URL or check storage
        availability, authentication, expiry, DNS, or CDN behavior.
      </p>
      <form
        className="site-page-stack"
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError('')
          setResult(null)
          void getRouteSimulation({ data: { slug, version, path } })
            .then(setResult)
            .catch((failure) =>
              setError(
                failure instanceof Error
                  ? failure.message
                  : 'Could not simulate this route.',
              ),
            )
            .finally(() => setBusy(false))
        }}
      >
        <label className="console-field">
          Request path
          <input
            value={path}
            onChange={(event) => {
              setPath(event.target.value)
              setResult(null)
            }}
            maxLength={1000}
            placeholder="/docs/getting-started"
            required
            disabled={busy}
          />
        </label>
        <button className="button button-ink" disabled={busy}>
          {busy ? 'Simulating…' : 'Simulate route'}
        </button>
      </form>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {result ? (
        <div role="status">
          <h3>Routing status {result.status}</h3>
          <p>
            Requested: <code>{result.requestedPath}</code> · Effective:{' '}
            <code>{result.effectivePath}</code>
          </p>
          {result.special ? (
            <p>
              Generated social image endpoint; image rendering is outside this
              simulation.
            </p>
          ) : result.redirect ? (
            <p>
              Redirect to{' '}
              <code style={{ overflowWrap: 'anywhere' }}>
                {result.redirect.to}
              </code>
              . The destination was not fetched.
            </p>
          ) : (
            <p>
              File: <code>{result.file ?? 'No matching file'}</code>
              {result.spa
                ? ' · SPA fallback'
                : result.status === 404 && result.file
                  ? ' · Custom 404 page'
                  : ''}
            </p>
          )}
          <h4>Matched custom header rules</h4>
          <p>Platform-controlled response headers may override these values.</p>
          {result.headers.length ? (
            <ul>
              {result.headers.map((header, index) => (
                <li key={index} style={{ overflowWrap: 'anywhere' }}>
                  <code>
                    {header.name}: {header.value}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p>No custom headers matched.</p>
          )}
        </div>
      ) : null}
    </details>
  )
}

import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { getSiteDomainsData } from '#/server/functions'
import { Route as SiteRoute } from './route'

export const Route = createFileRoute('/dashboard_/sites/$slug/domains')({
  loader: ({ params }) => getSiteDomainsData({ data: { slug: params.slug } }),
  component: SiteDomains,
})

function SiteDomains() {
  const { site } = SiteRoute.useLoaderData()
  const data = Route.useLoaderData()
  const router = useRouter()
  const [hostname, setHostname] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [removeTarget, setRemoveTarget] = useState<
    (typeof data.domains)[number] | null
  >(null)

  async function request(key: string, path: string, init: RequestInit) {
    setBusy(key)
    setError('')
    try {
      const response = await fetch(path, init)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          body.error?.message || 'The custom-domain action failed.',
        )
      }
      await router.invalidate()
      return body
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'The custom-domain action failed.',
      )
      throw requestError
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="site-page-stack">
      <section className="panel site-page-panel">
        <div className="panel-heading site-page-heading">
          <div>
            <span>CUSTOM DOMAINS</span>
            <h2>Bring your own hostname</h2>
            <p>
              Connect a domain, copy the DNS records, and Yeeet will manage TLS
              for you.
            </p>
          </div>
        </div>
        <form
          className="site-domain-add"
          onSubmit={(event) => {
            event.preventDefault()
            if (!hostname.trim()) return
            void request(
              'add',
              `/api/v1/sites/${encodeURIComponent(site.slug)}/domains`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ domain: hostname.trim() }),
              },
            )
              .then(() => setHostname(''))
              .catch(() => undefined)
          }}
        >
          <label>
            <span>Hostname</span>
            <input
              name="custom-domain"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              placeholder="docs.example.com…"
              autoComplete="off"
              spellCheck={false}
            />
            <small>Use a subdomain or apex domain that you control.</small>
          </label>
          <button
            type="submit"
            className="button button-ink"
            disabled={!hostname.trim() || Boolean(busy)}
          >
            {busy === 'add' ? 'Attaching…' : 'Attach domain'}
          </button>
        </form>
        {error ? (
          <p className="form-error site-page-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {data.domains.length ? (
        <section className="site-domain-grid" aria-label="Connected domains">
          {data.domains.map((domain) => (
            <article className="panel site-domain-card" key={domain.id}>
              <div className="site-domain-heading">
                <div>
                  <span>CONNECTED DOMAIN</span>
                  <h2>{domain.hostname}</h2>
                </div>
                <span
                  className={`state-pill ${domain.certificateStatus === 'ISSUED' ? 'live' : 'admin'}`}
                >
                  TLS {domain.certificateStatus.toLowerCase()}
                </span>
              </div>
              <a href={domain.url} target="_blank" rel="noreferrer">
                Open domain ↗
              </a>
              <p>Add these records at your DNS provider, then check again.</p>
              <div className="site-dns-records">
                {domain.dnsRecords.map((record) => (
                  <div key={`${record.hostlabel}-${record.requiredValue}`}>
                    <span
                      className={record.status === 'VALID' ? 'is-valid' : ''}
                    >
                      {record.status === 'VALID' ? '✓ Valid' : '→ Required'}
                    </span>
                    <code>
                      {record.hostlabel} CNAME {record.requiredValue}
                    </code>
                  </div>
                ))}
                {domain.verificationToken ? (
                  <div>
                    <span>→ Required</span>
                    <code>
                      {domain.verificationHost} TXT {domain.verificationToken}
                    </code>
                  </div>
                ) : null}
              </div>
              {domain.error ? (
                <p className="form-error" role="alert">
                  {domain.error}
                </p>
              ) : null}
              <div className="site-domain-actions">
                <button
                  type="button"
                  className="button button-paper"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void request(
                      `refresh-${domain.id}`,
                      `/api/v1/sites/${encodeURIComponent(site.slug)}/domains/${domain.id}/refresh`,
                      { method: 'POST' },
                    ).catch(() => undefined)
                  }
                >
                  {busy === `refresh-${domain.id}` ? 'Checking…' : 'Check DNS'}
                </button>
                <button
                  type="button"
                  className="button button-paper danger-link"
                  disabled={Boolean(busy)}
                  onClick={() => setRemoveTarget(domain)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel site-domain-empty">
          <span>◎</span>
          <h2>No custom domains yet</h2>
          <p>
            The built-in <code>{site.slug}.site.yeeet.dev</code> address stays
            active either way.
          </p>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={`Remove ${removeTarget?.hostname ?? 'domain'}?`}
        description={`Managed TLS and routing to ${site.slug} will stop. The site and every version will remain intact.`}
        confirmLabel="Remove domain"
        busy={busy.startsWith('delete-')}
        busyLabel="Removing…"
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return
          void request(
            `delete-${removeTarget.id}`,
            `/api/v1/sites/${encodeURIComponent(site.slug)}/domains/${removeTarget.id}`,
            { method: 'DELETE' },
          )
            .then(() => setRemoveTarget(null))
            .catch(() => undefined)
        }}
      />
    </div>
  )
}

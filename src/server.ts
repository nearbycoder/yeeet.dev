import { startRetentionWorker } from '#/server/retention'
import { startHealthWorker } from '#/server/lifecycle'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { recordSiteResponse, startAnalyticsWorker } from '#/server/analytics'
import { maybeServeDocs } from '#/server/docs-site'
import { maybeServeSite } from '#/server/site-gateway'
import { maybeServeRuntimeBundle } from '#/server/backend-runtime'
import { requireTrustedMutation } from '#/server/request-security'
import { errorResponse } from '#/server/http'
import { customDomainTlsAllowed } from '#/server/custom-domains'
import { startWebhookWorker } from '#/server/webhooks'

startWebhookWorker()
startAnalyticsWorker()
startHealthWorker()
startRetentionWorker()

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/_yeeet/internal/tls-allow') {
      const allowed =
        request.method === 'GET' &&
        url.hostname === 'yeeet-app' &&
        (await customDomainTlsAllowed(url.searchParams.get('domain') ?? ''))
      return new Response(null, { status: allowed ? 204 : 404 })
    }
    const bundleResponse = await maybeServeRuntimeBundle(request)
    if (bundleResponse) return bundleResponse
    const docsResponse = maybeServeDocs(request)
    if (docsResponse) return docsResponse
    const siteResponse = await maybeServeSite(request)
    if (siteResponse) {
      recordSiteResponse(request, siteResponse)
      return siteResponse
    }
    try {
      requireTrustedMutation(request)
    } catch (error) {
      return errorResponse(error)
    }
    return handler.fetch(request)
  },
})

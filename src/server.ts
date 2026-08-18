import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { recordSiteResponse, startAnalyticsWorker } from '#/server/analytics'
import { maybeServeDocs } from '#/server/docs-site'
import { maybeServeSite } from '#/server/site-gateway'
import { startWebhookWorker } from '#/server/webhooks'

startWebhookWorker()
startAnalyticsWorker()

export default createServerEntry({
  async fetch(request) {
    const docsResponse = maybeServeDocs(request)
    if (docsResponse) return docsResponse
    const siteResponse = await maybeServeSite(request)
    if (siteResponse) {
      recordSiteResponse(request, siteResponse)
      return siteResponse
    }
    return handler.fetch(request)
  },
})

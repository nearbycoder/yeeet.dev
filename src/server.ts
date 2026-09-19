import { startRetentionWorker } from '#/server/retention'
import { startHealthWorker } from '#/server/lifecycle'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { recordSiteResponse, startAnalyticsWorker } from '#/server/analytics'
import { maybeServeDocs } from '#/server/docs-site'
import { maybeServeSite } from '#/server/site-gateway'
import { requireTrustedMutation } from '#/server/request-security'
import { errorResponse } from '#/server/http'
import { startWebhookWorker } from '#/server/webhooks'

startWebhookWorker()
startAnalyticsWorker()
startHealthWorker()
startRetentionWorker()

export default createServerEntry({
  async fetch(request) {
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

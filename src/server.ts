import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { maybeServeDocs } from '#/server/docs-site'
import { maybeServeSite } from '#/server/site-gateway'
import { startWebhookWorker } from '#/server/webhooks'

startWebhookWorker()

export default createServerEntry({
  async fetch(request) {
    const docsResponse = maybeServeDocs(request)
    if (docsResponse) return docsResponse
    const siteResponse = await maybeServeSite(request)
    return siteResponse ?? handler.fetch(request)
  },
})

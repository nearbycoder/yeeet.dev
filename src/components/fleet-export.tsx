import { toCsv } from '#/lib/download'
import { DownloadButton } from './download-button'

type FleetSite = {
  slug: string
  url: string
  activeDeploymentId: string | null
  protected: boolean
  updatedAt: string
  fileCount: number | null
  totalBytes: number | null
  organization: { favorite: boolean; project: string; tags: Array<string> }
  customDomains: Array<{ hostname: string }>
}
export function FleetExport({ sites }: { sites: Array<FleetSite> }) {
  return (
    <div className="console-actions">
      <DownloadButton
        disabled={!sites.length}
        name="yeeet-fleet-page.csv"
        type="text/csv;charset=utf-8"
        content={() =>
          toCsv([
            [
              'site',
              'url',
              'live_version',
              'access',
              'updated_at',
              'files',
              'bytes',
              'favorite',
              'project',
              'tags',
              'domains',
            ],
            ...sites.map((site) => [
              site.slug,
              site.url,
              site.activeDeploymentId,
              site.protected ? 'private' : 'public',
              site.updatedAt,
              site.fileCount,
              site.totalBytes,
              String(site.organization.favorite),
              site.organization.project,
              site.organization.tags.join(', '),
              site.customDomains.map((domain) => domain.hostname).join(', '),
            ]),
          ])
        }
      >
        Export fleet page CSV
      </DownloadButton>
      <small>
        Exports these {sites.length} displayed sites with their organization and
        domains.
      </small>
    </div>
  )
}

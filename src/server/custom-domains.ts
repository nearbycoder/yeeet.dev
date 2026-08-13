import { randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { parse } from 'tldts'
import { db } from '#/db'
import { customDomains, sites } from '#/db/schema'
import { HttpError } from './http'
import { controlPlaneUrl, siteDomain } from './platform-config'

type DnsRecord = {
  hostlabel: string
  requiredValue: string
  currentValue?: string | null
  status: string
}

type RailwayDomainStatus = {
  verificationToken?: string | null
  dnsRecords?: Array<DnsRecord>
  certificateStatus?: string | null
}

type RailwayCustomDomain = {
  id: string
  domain: string
  status: RailwayDomainStatus
}

const RAILWAY_API = 'https://backboard.railway.com/graphql/v2'

function railwayConfiguration() {
  const projectId = process.env.RAILWAY_PROJECT_ID
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID
  const serviceId = process.env.RAILWAY_SERVICE_ID
  const projectToken = process.env.RAILWAY_TOKEN
  const apiToken = process.env.RAILWAY_API_TOKEN
  if (
    !projectId ||
    !environmentId ||
    !serviceId ||
    (!projectToken && !apiToken)
  ) {
    throw new HttpError(
      503,
      'Custom domains are not configured yet. The platform operator must add a Railway project token.',
      'custom_domains_unavailable',
    )
  }
  const headers: Record<string, string> = projectToken
    ? { 'Project-Access-Token': projectToken }
    : { authorization: `Bearer ${apiToken}` }
  return {
    projectId,
    environmentId,
    serviceId,
    headers,
  }
}

async function railwayGraphql<T>(
  query: string,
  variables: unknown,
): Promise<T> {
  const config = railwayConfiguration()
  const response = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...config.headers },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    data?: T
    errors?: Array<{ message?: string }>
  }
  if (!response.ok || !body.data || body.errors?.length) {
    throw new HttpError(
      502,
      body.errors?.[0]?.message ||
        `Railway domain provisioning failed (${response.status}).`,
      'railway_domain_error',
    )
  }
  return body.data
}

export function normalizeCustomDomain(value: string) {
  const trimmed = value.trim().toLowerCase().replace(/\.$/, '')
  const hostname = domainToASCII(trimmed)
  const parsed = parse(hostname)
  const labels = hostname.split('.')
  if (
    !hostname ||
    hostname.includes('/') ||
    hostname.includes(':') ||
    hostname.startsWith('*.') ||
    hostname.length > 253 ||
    labels.some(
      (label) =>
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) ||
        label.length > 63,
    ) ||
    isIP(hostname) !== 0 ||
    !parsed.domain
  ) {
    throw new HttpError(
      400,
      'Enter a valid hostname such as docs.example.com (without https:// or a path).',
      'invalid_domain',
    )
  }
  const platformDomain = siteDomain()
  const platformHost = new URL(controlPlaneUrl()).hostname
  if (
    hostname === platformHost ||
    hostname === platformDomain ||
    hostname.endsWith(`.${platformDomain}`)
  ) {
    throw new HttpError(
      409,
      'That hostname is reserved by the Yeeet platform.',
      'reserved_domain',
    )
  }
  return hostname
}

function verificationHost(hostname: string) {
  const parsed = parse(hostname)
  return `_railway-verify${parsed.subdomain ? `.${parsed.subdomain}` : ''}`
}

function parseDnsRecords(value: string): Array<DnsRecord> {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as Array<DnsRecord>) : []
  } catch {
    return []
  }
}

function domainResult(row: typeof customDomains.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    railwayDomainId: row.railwayDomainId,
    verificationToken: row.verificationToken,
    verificationHost: row.verificationHost,
    dnsRecords: parseDnsRecords(row.dnsRecords),
    certificateStatus: row.certificateStatus,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listUserCustomDomains(userId: string) {
  const rows = await db.query.customDomains.findMany({
    where: eq(customDomains.userId, userId),
  })
  return rows.map(domainResult)
}

async function ownedSite(userId: string, value: string) {
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.slug, value), eq(sites.userId, userId)),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  return site
}

async function ownedDomain(userId: string, id: string, slug: string) {
  const domain = await db.query.customDomains.findFirst({
    where: and(eq(customDomains.id, id), eq(customDomains.userId, userId)),
  })
  if (!domain) throw new HttpError(404, 'Custom domain not found.', 'not_found')
  const site = await ownedSite(userId, slug)
  if (domain.siteId !== site.id) {
    throw new HttpError(404, 'Custom domain not found.', 'not_found')
  }
  return domain
}

export async function listCustomDomains(userId: string, slug: string) {
  const site = await ownedSite(userId, slug)
  const rows = await db.query.customDomains.findMany({
    where: eq(customDomains.siteId, site.id),
  })
  return rows.map(domainResult)
}

export async function createCustomDomain(
  userId: string,
  slug: string,
  value: string,
) {
  const site = await ownedSite(userId, slug)
  const hostname = normalizeCustomDomain(value)
  const existing = await db.query.customDomains.findFirst({
    where: eq(customDomains.hostname, hostname),
  })
  if (existing) {
    throw new HttpError(
      409,
      'That hostname is already connected to a Yeeet site.',
      'domain_taken',
    )
  }

  const config = railwayConfiguration()
  // Project-scoped tokens may create domains for their environment but cannot
  // call Railway's global customDomainAvailable query. The mutation performs
  // the same authoritative validation without requiring broader credentials.
  const created = await railwayGraphql<{
    customDomainCreate: RailwayCustomDomain
  }>(
    `mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id domain
        status {
          verificationToken
          dnsRecords { hostlabel requiredValue status }
        }
      }
    }`,
    {
      input: {
        projectId: config.projectId,
        environmentId: config.environmentId,
        serviceId: config.serviceId,
        domain: hostname,
        targetPort: 8080,
      },
    },
  )
  const provider = created.customDomainCreate
  const [row] = await db
    .insert(customDomains)
    .values({
      id: randomUUID(),
      siteId: site.id,
      userId,
      hostname,
      railwayDomainId: provider.id,
      verificationToken: provider.status.verificationToken,
      verificationHost: verificationHost(hostname),
      dnsRecords: JSON.stringify(provider.status.dnsRecords ?? []),
      certificateStatus: provider.status.certificateStatus ?? 'PENDING',
    })
    .returning()
    .catch(async (error: unknown) => {
      await removeRailwayCustomDomain(provider.id).catch(() => undefined)
      throw error
    })
  return domainResult(row)
}

export async function refreshCustomDomain(
  userId: string,
  slug: string,
  id: string,
) {
  const domain = await ownedDomain(userId, id, slug)
  const config = railwayConfiguration()
  const result = await railwayGraphql<{
    customDomain: RailwayCustomDomain
  }>(
    `query customDomain($id: String!, $projectId: String!) {
      customDomain(id: $id, projectId: $projectId) {
        id domain
        status {
          verificationToken
          certificateStatus
          dnsRecords { hostlabel requiredValue currentValue status }
        }
      }
    }`,
    { id: domain.railwayDomainId, projectId: config.projectId },
  )
  const status = result.customDomain.status
  const [updated] = await db
    .update(customDomains)
    .set({
      verificationToken: status.verificationToken,
      dnsRecords: JSON.stringify(status.dnsRecords ?? []),
      certificateStatus: status.certificateStatus ?? 'PENDING',
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(customDomains.id, domain.id))
    .returning()
  return domainResult(updated)
}

export async function removeRailwayCustomDomain(id: string) {
  await railwayGraphql<{ customDomainDelete: boolean }>(
    `mutation customDomainDelete($id: String!) {
      customDomainDelete(id: $id)
    }`,
    { id },
  )
}

export async function deleteCustomDomain(
  userId: string,
  slug: string,
  id: string,
) {
  const domain = await ownedDomain(userId, id, slug)
  await removeRailwayCustomDomain(domain.railwayDomainId)
  await db.delete(customDomains).where(eq(customDomains.id, domain.id))
  return { id: domain.id, hostname: domain.hostname, deleted: true }
}

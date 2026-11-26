import { randomUUID } from 'node:crypto'
import { Resolver } from 'node:dns/promises'
import { connect } from 'node:tls'
import { isIP } from 'node:net'
import { domainToASCII } from 'node:url'
import { and, eq, isNotNull } from 'drizzle-orm'
import { parse } from 'tldts'
import { db } from '#/db'
import { customDomains, sites } from '#/db/schema'
import { HttpError, pgErrorInfo } from './http'
import { controlPlaneUrl, docsHost, siteDomain } from './platform-config'

type DnsRecord = {
  hostlabel: string
  requiredValue: string
  currentValue?: string | null
  status: string
  type?: 'A' | 'CNAME'
}

function configuration() {
  const target = process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase()
  const ip = process.env.CUSTOM_DOMAIN_IPV4?.trim()
  if (!target || !ip || isIP(ip) !== 4) {
    throw new HttpError(
      503,
      'Custom domains are not configured on this Yeeet instance.',
      'custom_domains_unavailable',
    )
  }
  return { target, ip }
}

function routingRecord(
  hostname: string,
  config: ReturnType<typeof configuration>,
): DnsRecord {
  const apex = !parse(hostname, { allowPrivateDomains: true }).subdomain
  return {
    hostlabel: hostname,
    type: apex ? 'A' : 'CNAME',
    requiredValue: apex ? config.ip : config.target,
    status: 'PENDING',
  }
}

async function dnsAnswers<T>(lookup: Promise<T[]>): Promise<T[]> {
  try {
    return await lookup
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') return []
    throw new HttpError(
      502,
      'DNS lookup failed. Try checking again.',
      'dns_lookup_failed',
    )
  }
}

export function verifyCustomDomainDns(
  answers: { txt: string[][]; ipv4: string[]; ipv6: string[] },
  token: string,
  ip: string,
) {
  const ownsDomain = answers.txt.some((entry) => entry.join('') === token)
  // CNAMEs and flattened apex records share the same effective addresses.
  const routesToYeeet =
    answers.ipv4.length > 0 &&
    answers.ipv4.every((address) => address === ip) &&
    answers.ipv6.length === 0
  return { ownsDomain, routesToYeeet }
}

function certificateIssued(hostname: string, ip: string) {
  return new Promise<boolean>((resolve) => {
    // Always connect to our edge. The customer hostname is used only for SNI.
    const socket = connect({ host: ip, port: 443, servername: hostname })
    const finish = (issued: boolean) => {
      socket.destroy()
      resolve(issued)
    }
    socket.setTimeout(8_000)
    socket.once('secureConnect', () => finish(socket.authorized))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
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
    hostname.length > 253 - '_yeeet-verify.'.length ||
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
  const platformHost = new URL(controlPlaneUrl()).hostname.toLowerCase()
  const docs = docsHost()
  const reservedExact = new Set(
    [
      platformHost,
      platformDomain,
      docs,
      process.env.CUSTOM_DOMAIN_TARGET?.trim().toLowerCase(),
      process.env.RAILWAY_PUBLIC_DOMAIN?.trim().toLowerCase(),
      process.env.RAILWAY_PRIVATE_DOMAIN?.trim().toLowerCase(),
    ].filter((entry): entry is string => Boolean(entry)),
  )
  if (
    reservedExact.has(hostname) ||
    hostname.endsWith(`.${platformDomain}`) ||
    hostname.endsWith(`.${platformHost}`) ||
    hostname.endsWith(`.${docs}`)
  ) {
    throw new HttpError(
      409,
      'That hostname is reserved by the Yeeet platform.',
      'reserved_domain',
    )
  }
  return hostname
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
  const dnsRecords = parseDnsRecords(row.dnsRecords)
  if (
    !dnsRecords.length &&
    process.env.CUSTOM_DOMAIN_TARGET &&
    process.env.CUSTOM_DOMAIN_IPV4
  ) {
    dnsRecords.push(routingRecord(row.hostname, configuration()))
  }
  return {
    id: row.id,
    siteId: row.siteId,
    hostname: row.hostname,
    url: `https://${row.hostname}`,
    railwayDomainId: row.railwayDomainId,
    verificationToken: row.verificationToken,
    verificationHost: row.verificationHost,
    dnsRecords,
    dnsVerified: row.dnsVerifiedAt !== null,
    certificateStatus: row.certificateStatus,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function ownedSite(userId: string, value: string) {
  const site = await db.query.sites.findFirst({
    where: and(
      eq(sites.slug, value.trim().toLowerCase()),
      eq(sites.userId, userId),
    ),
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
  const record = routingRecord(hostname, configuration())
  const [row] = await db
    .insert(customDomains)
    .values({
      id: randomUUID(),
      siteId: site.id,
      userId,
      hostname,
      verificationToken: `yeeet-verify=${randomUUID()}`,
      verificationHost: `_yeeet-verify.${hostname}`,
      dnsRecords: JSON.stringify([record]),
    })
    .returning()
    .catch((error: unknown) => {
      if (pgErrorInfo(error).code === '23505') {
        throw new HttpError(
          409,
          'That hostname is already connected to a Yeeet site.',
          'domain_taken',
        )
      }
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
  const config = configuration()
  const resolver = new Resolver({ timeout: 2_000, tries: 2 })
  if (!domain.verificationHost || !domain.verificationToken) {
    throw new HttpError(
      409,
      'Remove and reattach this hostname to get verification records.',
      'missing_domain_verification',
    )
  }
  const [txt, ipv4, ipv6] = await Promise.all([
    dnsAnswers(resolver.resolveTxt(domain.verificationHost)),
    dnsAnswers(resolver.resolve4(domain.hostname)),
    dnsAnswers(resolver.resolve6(domain.hostname)),
  ])
  const { ownsDomain, routesToYeeet } = verifyCustomDomainDns(
    { txt, ipv4, ipv6 },
    domain.verificationToken,
    config.ip,
  )
  const verified = ownsDomain && routesToYeeet
  const record = routingRecord(domain.hostname, config)
  record.status = routesToYeeet ? 'VALID' : 'PENDING'
  const checkedAt = new Date()
  const updatedRows = await db
    .update(customDomains)
    .set({
      dnsVerifiedAt: verified ? checkedAt : null,
      dnsRecords: JSON.stringify([record]),
      certificateStatus:
        verified && domain.dnsVerifiedAt ? domain.certificateStatus : 'PENDING',
      error: !ownsDomain
        ? 'Add the verification TXT record, then check DNS again.'
        : !routesToYeeet
          ? 'Point this hostname exclusively at Yeeet, then check DNS again.'
          : null,
      updatedAt: checkedAt,
    })
    .where(eq(customDomains.id, domain.id))
    .returning()
  const updated = updatedRows.at(0)
  if (!updated)
    throw new HttpError(404, 'Custom domain not found.', 'not_found')
  if (!verified) return domainResult(updated)

  const issued = await certificateIssued(domain.hostname, config.ip)
  const checkedRows = await db
    .update(customDomains)
    .set({ certificateStatus: issued ? 'ISSUED' : 'PENDING' })
    .where(
      and(
        eq(customDomains.id, domain.id),
        eq(customDomains.dnsVerifiedAt, checkedAt),
      ),
    )
    .returning()
  return domainResult(
    checkedRows.at(0) ?? (await ownedDomain(userId, id, slug)),
  )
}

export async function customDomainTlsAllowed(hostname: string) {
  if (!process.env.CUSTOM_DOMAIN_TARGET || !process.env.CUSTOM_DOMAIN_IPV4)
    return false
  try {
    hostname = normalizeCustomDomain(hostname)
  } catch (error) {
    if (error instanceof HttpError) return false
    throw error
  }
  return Boolean(
    await db.query.customDomains.findFirst({
      columns: { id: true },
      where: and(
        eq(customDomains.hostname, hostname),
        isNotNull(customDomains.dnsVerifiedAt),
      ),
    }),
  )
}

export async function deleteCustomDomain(
  userId: string,
  slug: string,
  id: string,
) {
  const domain = await ownedDomain(userId, id, slug)
  await db.delete(customDomains).where(eq(customDomains.id, domain.id))
  return { id: domain.id, hostname: domain.hostname, deleted: true }
}

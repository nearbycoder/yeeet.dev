import { randomUUID } from 'node:crypto'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db } from '#/db'
import { deployments, siteAnalyticsDaily, sites } from '#/db/schema'
import { HttpError } from './http'
import { siteUrl } from './platform-config'

type AnalyticsBucket = {
  siteId: string
  userId: string
  date: string
  path: string
  status: number
  views: number
}

const buffer = new Map<string, AnalyticsBucket>()
const deploymentOwners = new Map<
  string,
  Promise<{ siteId: string; userId: string } | null>
>()
const observedPaths = new Map<string, Set<string>>()
let flushing = false
let workerStarted = false

function utcDate(value = new Date()) {
  return value.toISOString().slice(0, 10)
}

export function normalizeAnalyticsPath(pathname: string, status: number) {
  if (status >= 400) return '/(error)'
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    // Keep the encoded value and sanitize it below.
  }
  const segments = decoded
    .split('/')
    .filter(Boolean)
    .slice(0, 4)
    .map((segment) => {
      if (
        segment.length > 48 ||
        /@/.test(segment) ||
        /^\d+$/.test(segment) ||
        /^[a-f0-9]{16,}$/i.test(segment) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)
      ) {
        return ':id'
      }
      return segment.replace(/[^a-z0-9._~-]/gi, '_') || '_'
    })
  const suffix = decoded.split('/').filter(Boolean).length > 4 ? '/*' : ''
  return segments.length ? `/${segments.join('/')}${suffix}` : '/'
}

function deploymentOwner(deploymentId: string) {
  const cached = deploymentOwners.get(deploymentId)
  if (cached) return cached
  if (deploymentOwners.size >= 10_000) deploymentOwners.clear()
  const value = db.query.deployments
    .findFirst({
      where: eq(deployments.id, deploymentId),
      columns: { siteId: true, userId: true },
    })
    .then((row) => row ?? null)
    .catch((error) => {
      deploymentOwners.delete(deploymentId)
      throw error
    })
  deploymentOwners.set(deploymentId, value)
  return value
}

function addBucket(bucket: AnalyticsBucket) {
  const key = [bucket.siteId, bucket.date, bucket.path, bucket.status].join(
    '\u0000',
  )
  const current = buffer.get(key)
  if (current) current.views += bucket.views
  else buffer.set(key, bucket)
  if (buffer.size >= 500) {
    void flushAnalytics().catch((error) =>
      console.error('Analytics flush failed', error),
    )
  }
}

export function recordSiteResponse(request: Request, response: Response) {
  if (request.method !== 'GET') return
  const deploymentId = response.headers.get('x-yeeet-deployment')
  if (!deploymentId) return
  const contentType = response.headers.get('content-type') ?? ''
  const documentResponse =
    contentType.includes('text/html') ||
    (response.status >= 300 && response.status < 400)
  if (!documentResponse) return

  const date = utcDate()
  let path = normalizeAnalyticsPath(
    new URL(request.url).pathname,
    response.status,
  )
  void deploymentOwner(deploymentId)
    .then((owner) => {
      if (!owner) return
      const pathKey = `${owner.siteId}:${date}`
      let paths = observedPaths.get(pathKey)
      if (!paths) {
        if (observedPaths.size >= 1_000) observedPaths.clear()
        paths = new Set()
        observedPaths.set(pathKey, paths)
      }
      if (!paths.has(path) && paths.size >= 200) path = '/(other)'
      paths.add(path)
      addBucket({
        ...owner,
        date,
        path,
        status: response.status,
        views: 1,
      })
    })
    .catch((error) => console.error('Analytics record failed', error))
}

export async function flushAnalytics() {
  if (flushing || !buffer.size) return
  flushing = true
  const entries = [...buffer.entries()]
  buffer.clear()
  try {
    for (let index = 0; index < entries.length; index += 500) {
      const batch = entries.slice(index, index + 500).map(([, bucket]) => ({
        id: randomUUID(),
        ...bucket,
      }))
      await db
        .insert(siteAnalyticsDaily)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            siteAnalyticsDaily.siteId,
            siteAnalyticsDaily.date,
            siteAnalyticsDaily.path,
            siteAnalyticsDaily.status,
          ],
          set: {
            views: sql`${siteAnalyticsDaily.views} + excluded.views`,
            updatedAt: new Date(),
          },
        })
    }
  } catch (error) {
    for (const [key, bucket] of entries) {
      const current = buffer.get(key)
      if (current) current.views += bucket.views
      else buffer.set(key, bucket)
    }
    throw error
  } finally {
    flushing = false
  }
}

export function startAnalyticsWorker() {
  if (workerStarted || process.env.NODE_ENV === 'test') return
  workerStarted = true
  const timer = setInterval(() => {
    void flushAnalytics().catch((error) =>
      console.error('Analytics flush failed', error),
    )
  }, 5_000)
  timer.unref()
}

export async function getSiteAnalytics(
  userId: string,
  value: string,
  requestedDays = 30,
) {
  await flushAnalytics()
  const days = Math.min(Math.max(Math.floor(requestedDays) || 30, 1), 90)
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.slug, value), eq(sites.userId, userId)),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - days + 1)
  const from = utcDate(start)
  const rows = await db
    .select({
      date: siteAnalyticsDaily.date,
      path: siteAnalyticsDaily.path,
      status: siteAnalyticsDaily.status,
      views: siteAnalyticsDaily.views,
    })
    .from(siteAnalyticsDaily)
    .where(
      and(
        eq(siteAnalyticsDaily.siteId, site.id),
        gte(siteAnalyticsDaily.date, from),
      ),
    )
    .orderBy(asc(siteAnalyticsDaily.date))

  const daily = new Map<string, number>()
  const paths = new Map<string, number>()
  const statuses = { successful: 0, redirects: 0, errors: 0 }
  let totalViews = 0
  for (const row of rows) {
    totalViews += row.views
    daily.set(row.date, (daily.get(row.date) ?? 0) + row.views)
    paths.set(row.path, (paths.get(row.path) ?? 0) + row.views)
    if (row.status >= 400) statuses.errors += row.views
    else if (row.status >= 300) statuses.redirects += row.views
    else statuses.successful += row.views
  }
  const dailyRows = Array.from({ length: days }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    const key = utcDate(date)
    return { date: key, views: daily.get(key) ?? 0 }
  })

  return {
    site: { id: site.id, slug: site.slug, url: siteUrl(site.slug) },
    period: { days, from, to: utcDate() },
    totalViews,
    statuses,
    daily: dailyRows,
    topPaths: [...paths.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort(
        (left, right) =>
          right.views - left.views || left.path.localeCompare(right.path),
      )
      .slice(0, 20),
    privacy: {
      uniqueVisitors: false,
      stored: ['UTC day', 'normalized path', 'HTTP status', 'aggregate views'],
      notStored: [
        'IP address',
        'cookie',
        'user agent',
        'referrer',
        'visitor ID',
      ],
    },
  }
}

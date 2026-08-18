import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import { db } from '#/db'
import { webhookDeliveries, webhookEndpoints } from '#/db/schema'
import { HttpError } from './http'

export const WEBHOOK_EVENTS = [
  'deployment.ready',
  'deployment.activated',
  'deployment.deleted',
  'site.deleted',
  'channel.updated',
  'channel.deleted',
] as const

type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]
const EVENT_SET = new Set<string>(WEBHOOK_EVENTS)
const MAX_ATTEMPTS = 6
const DELIVERY_LEASE_MS = 30_000
const RETRY_DELAYS_MS = [30_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]

function signingKey() {
  const value = process.env.BETTER_AUTH_SECRET
  if (!value) {
    throw new HttpError(
      503,
      'Webhook signing is unavailable until BETTER_AUTH_SECRET is configured.',
      'webhooks_unavailable',
    )
  }
  return value
}

function webhookSecret(id: string, nonce: string) {
  return `whsec_${createHmac('sha256', signingKey())
    .update(`yeeet-webhook:${id}:${nonce}`)
    .digest('base64url')}`
}

export function webhookSignature(
  secret: string,
  timestamp: number,
  body: string,
) {
  return `t=${timestamp},v1=${createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')}`
}

function privateIpv4(value: string) {
  const octets = value.split('.').map(Number)
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return true
  }
  const [first, second] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

export function isPrivateWebhookAddress(value: string) {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '')
  const version = isIP(normalized)
  if (version === 4) return privateIpv4(normalized)
  if (version !== 6) return false
  if (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized)
  ) {
    return true
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  return mapped ? privateIpv4(mapped[1]) : false
}

export async function normalizeWebhookUrl(value: string) {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new HttpError(
      400,
      'Enter a valid HTTPS webhook URL.',
      'invalid_webhook_url',
    )
  }
  const localDevelopment =
    process.env.NODE_ENV !== 'production' &&
    (url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))
  if (
    (url.protocol !== 'https:' &&
      !(localDevelopment && url.protocol === 'http:')) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new HttpError(
      400,
      'Webhook URLs must use HTTPS and cannot contain credentials or fragments.',
      'invalid_webhook_url',
    )
  }
  if (!localDevelopment) {
    if (isPrivateWebhookAddress(url.hostname)) {
      throw new HttpError(
        400,
        'Webhook URLs cannot target private or loopback networks.',
        'unsafe_webhook_url',
      )
    }
    let addresses: Array<{ address: string }>
    try {
      addresses = await lookup(url.hostname, { all: true, verbatim: true })
    } catch {
      throw new HttpError(
        400,
        'The webhook hostname could not be resolved.',
        'invalid_webhook_url',
      )
    }
    if (
      !addresses.length ||
      addresses.some((entry) => isPrivateWebhookAddress(entry.address))
    ) {
      throw new HttpError(
        400,
        'Webhook URLs cannot resolve to private or loopback networks.',
        'unsafe_webhook_url',
      )
    }
  }
  url.pathname ||= '/'
  return url.toString()
}

function normalizeEvents(value?: Array<string>) {
  const events = [...new Set(value?.length ? value : ['*'])]
  if (events.some((event) => event !== '*' && !EVENT_SET.has(event))) {
    throw new HttpError(
      400,
      `Webhook events must be * or one of: ${WEBHOOK_EVENTS.join(', ')}.`,
      'invalid_webhook_events',
    )
  }
  return events
}

function parseEvents(value: string) {
  try {
    const events = JSON.parse(value)
    return Array.isArray(events) ? (events as Array<string>) : []
  } catch {
    return []
  }
}

function endpointResult(row: typeof webhookEndpoints.$inferSelect) {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    events: parseEvents(row.events),
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listWebhookEndpoints(userId: string) {
  const rows = await db.query.webhookEndpoints.findMany({
    where: eq(webhookEndpoints.userId, userId),
    orderBy: [desc(webhookEndpoints.createdAt)],
  })
  return rows.map(endpointResult)
}

export async function createWebhookEndpoint(
  userId: string,
  input: { url: string; label?: string; events?: Array<string> },
) {
  const existing = await listWebhookEndpoints(userId)
  if (existing.length >= 20) {
    throw new HttpError(
      409,
      'An account may have at most 20 webhooks.',
      'webhook_limit',
    )
  }
  const id = randomUUID()
  const secretNonce = randomBytes(18).toString('base64url')
  const [row] = await db
    .insert(webhookEndpoints)
    .values({
      id,
      userId,
      url: await normalizeWebhookUrl(input.url),
      label: (input.label?.trim() || 'Webhook').slice(0, 100),
      events: JSON.stringify(normalizeEvents(input.events)),
      secretNonce,
    })
    .returning()
  return { ...endpointResult(row), secret: webhookSecret(id, secretNonce) }
}

export async function updateWebhookEndpoint(
  userId: string,
  id: string,
  input: {
    url?: string
    label?: string
    events?: Array<string>
    active?: boolean
    rotateSecret?: boolean
  },
) {
  const current = await db.query.webhookEndpoints.findFirst({
    where: and(
      eq(webhookEndpoints.id, id),
      eq(webhookEndpoints.userId, userId),
    ),
  })
  if (!current) throw new HttpError(404, 'Webhook not found.', 'not_found')
  const secretNonce = input.rotateSecret
    ? randomBytes(18).toString('base64url')
    : current.secretNonce
  const [row] = await db
    .update(webhookEndpoints)
    .set({
      ...(input.url ? { url: await normalizeWebhookUrl(input.url) } : {}),
      ...(input.label !== undefined
        ? { label: (input.label.trim() || 'Webhook').slice(0, 100) }
        : {}),
      ...(input.events
        ? { events: JSON.stringify(normalizeEvents(input.events)) }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      secretNonce,
      updatedAt: new Date(),
    })
    .where(
      and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)),
    )
    .returning()
  return {
    ...endpointResult(row),
    ...(input.rotateSecret ? { secret: webhookSecret(id, secretNonce) } : {}),
  }
}

export async function deleteWebhookEndpoint(userId: string, id: string) {
  const rows = await db
    .delete(webhookEndpoints)
    .where(
      and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, userId)),
    )
    .returning({ id: webhookEndpoints.id })
  if (!rows.length) throw new HttpError(404, 'Webhook not found.', 'not_found')
  return { id, deleted: true as const }
}

export async function listWebhookDeliveries(userId: string, limit = 50) {
  const rows = await db.query.webhookDeliveries.findMany({
    where: eq(webhookDeliveries.userId, userId),
    orderBy: [desc(webhookDeliveries.createdAt)],
    limit: Math.min(Math.max(limit, 1), 100),
  })
  return rows.map((row) => ({
    id: row.id,
    endpointId: row.endpointId,
    eventId: row.eventId,
    event: row.event,
    status: row.status,
    attempts: row.attempts,
    responseStatus: row.responseStatus,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
  }))
}

export async function queueWebhookEvent(
  userId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  eventId: string = randomUUID(),
) {
  const endpoints = await db.query.webhookEndpoints.findMany({
    where: and(
      eq(webhookEndpoints.userId, userId),
      eq(webhookEndpoints.active, true),
    ),
  })
  const selected = endpoints.filter((endpoint) => {
    const events = parseEvents(endpoint.events)
    return events.includes('*') || events.includes(event)
  })
  if (!selected.length) return { eventId, deliveries: 0 }
  const createdAt = new Date().toISOString()
  const payload = JSON.stringify({ id: eventId, event, createdAt, data })
  await db
    .insert(webhookDeliveries)
    .values(
      selected.map((endpoint) => ({
        id: randomUUID(),
        endpointId: endpoint.id,
        userId,
        eventId,
        event,
        payload,
      })),
    )
    .onConflictDoNothing()
  void processDueWebhookDeliveries().catch((error) =>
    console.error('Webhook delivery worker failed', error),
  )
  return { eventId, deliveries: selected.length }
}

async function postWebhook(
  url: URL,
  headers: Record<string, string>,
  body: string,
) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  const address = addresses.find(
    (entry) => !isPrivateWebhookAddress(entry.address),
  )
  if (
    !address ||
    addresses.some((entry) => isPrivateWebhookAddress(entry.address))
  ) {
    throw new Error(
      'Webhook hostname resolved to a private or loopback network.',
    )
  }
  const request = url.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise<number>((resolvePromise, reject) => {
    const outgoing = request(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-length': String(Buffer.byteLength(body)),
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address.address, address.family),
      },
      (response) => {
        response.resume()
        response.on('end', () => resolvePromise(response.statusCode ?? 0))
      },
    )
    outgoing.setTimeout(10_000, () =>
      outgoing.destroy(new Error('Webhook request timed out.')),
    )
    outgoing.on('error', reject)
    outgoing.end(body)
  })
}

async function deliverWebhook(
  delivery: typeof webhookDeliveries.$inferSelect,
  endpoint: typeof webhookEndpoints.$inferSelect,
) {
  const attempts = delivery.attempts + 1
  try {
    const url = await normalizeWebhookUrl(endpoint.url)
    const timestamp = Math.floor(Date.now() / 1000)
    const responseStatus = await postWebhook(
      new URL(url),
      {
        'content-type': 'application/json',
        'user-agent': `yeeet-webhooks/1.0 event/${delivery.event}`,
        'x-yeeet-delivery': delivery.id,
        'x-yeeet-event': delivery.event,
        'x-yeeet-signature': webhookSignature(
          webhookSecret(endpoint.id, endpoint.secretNonce),
          timestamp,
          delivery.payload,
        ),
      },
      delivery.payload,
    )
    if (responseStatus < 200 || responseStatus >= 300) {
      const responseError = new Error(
        `Endpoint returned HTTP ${responseStatus}.`,
      )
      Object.assign(responseError, { responseStatus })
      throw responseError
    }
    await db
      .update(webhookDeliveries)
      .set({
        status: 'succeeded',
        attempts,
        responseStatus,
        deliveredAt: new Date(),
        error: null,
      })
      .where(eq(webhookDeliveries.id, delivery.id))
  } catch (error) {
    const failed = attempts >= MAX_ATTEMPTS
    const delay =
      RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)]
    await db
      .update(webhookDeliveries)
      .set({
        status: failed ? 'failed' : 'pending',
        attempts,
        responseStatus:
          typeof error === 'object' &&
          error !== null &&
          'responseStatus' in error &&
          typeof error.responseStatus === 'number'
            ? error.responseStatus
            : null,
        nextAttemptAt: new Date(Date.now() + delay),
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          1000,
        ),
      })
      .where(eq(webhookDeliveries.id, delivery.id))
  }
}

export async function processDueWebhookDeliveries() {
  const now = new Date()
  const due = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(
      webhookEndpoints,
      eq(webhookDeliveries.endpointId, webhookEndpoints.id),
    )
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.nextAttemptAt, now),
        eq(webhookEndpoints.active, true),
      ),
    )
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(20)

  await Promise.all(
    due.map(async ({ delivery, endpoint }) => {
      const claimed = await db
        .update(webhookDeliveries)
        .set({ nextAttemptAt: new Date(Date.now() + DELIVERY_LEASE_MS) })
        .where(
          and(
            eq(webhookDeliveries.id, delivery.id),
            eq(webhookDeliveries.status, 'pending'),
            lte(webhookDeliveries.nextAttemptAt, now),
          ),
        )
        .returning({ id: webhookDeliveries.id })
      if (claimed.length) await deliverWebhook(delivery, endpoint)
    }),
  )
}

let workerStarted = false

export function startWebhookWorker() {
  if (workerStarted || process.env.NODE_ENV === 'test') return
  workerStarted = true
  void processDueWebhookDeliveries().catch((error) =>
    console.error('Webhook delivery worker failed', error),
  )
  const timer = setInterval(() => {
    void processDueWebhookDeliveries().catch((error) =>
      console.error('Webhook delivery worker failed', error),
    )
  }, 15_000)
  timer.unref()
}

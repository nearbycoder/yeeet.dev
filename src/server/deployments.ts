import { randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { customDomains, deploymentFiles, deployments, sites } from '#/db/schema'
import type { Actor } from './actor'
import {
  generateShareNonce,
  hashDeploymentPassword,
  shareTokenForDeployment,
} from './deployment-access'
import { removeRailwayCustomDomain } from './custom-domains'
import { HttpError } from './http'
import { siteUrl } from './platform-config'
import {
  copyStoredObject,
  createUploadUrl,
  deleteStoredPrefix,
  getStoredObject,
  headStoredObject,
} from './storage'
import {
  HEADERS_FILE,
  REDIRECTS_FILE,
  parseHeaderRules,
  parseRedirectRules,
} from './site-rules'

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const MAX_FILE_COUNT = 5_000
const SHA256 = /^[a-f0-9]{64}$/
const RANDOM_ADJECTIVES = [
  'brisk',
  'cosmic',
  'lucky',
  'neon',
  'rapid',
  'solar',
  'swift',
] as const
const RANDOM_NOUNS = [
  'comet',
  'falcon',
  'meteor',
  'orbit',
  'rocket',
  'signal',
  'voyager',
] as const

export type ManifestFile = {
  path: string
  size: number
  contentType?: string
  checksum?: string
}

export function versionUrl(deploymentId: string) {
  return siteUrl(`v-${deploymentId.replaceAll('-', '')}`)
}

export function shareUrl(deploymentId: string, shareNonce: string) {
  const url = new URL(versionUrl(deploymentId))
  url.searchParams.set(
    'share',
    shareTokenForDeployment(deploymentId, shareNonce),
  )
  return url.toString()
}

export function normalizeSlug(value: string) {
  const slug = value.trim().toLowerCase()
  if (!SLUG.test(slug) || slug.includes('--')) {
    throw new HttpError(
      400,
      'Site names must be 1–63 lowercase letters, numbers, or single hyphens.',
      'invalid_slug',
    )
  }
  return slug
}

export function generateRandomSlug() {
  const bytes = randomBytes(4)
  const adjective = RANDOM_ADJECTIVES[bytes[0] % RANDOM_ADJECTIVES.length]
  const noun = RANDOM_NOUNS[bytes[1] % RANDOM_NOUNS.length]
  return `${adjective}-${noun}-${bytes.toString('hex').slice(0, 6)}`
}

export function normalizeFilePath(value: string) {
  const path = value.replaceAll('\\', '/').replace(/^\/+/, '')
  const parts = path.split('/').filter((part) => part && part !== '.')
  if (
    !parts.length ||
    parts.some((part) => part === '..' || part.includes('\0')) ||
    path.length > 1024
  ) {
    throw new HttpError(400, `Invalid file path: ${value}`, 'invalid_path')
  }
  return parts.join('/')
}

export function validateManifest(files: Array<ManifestFile>) {
  if (!Array.isArray(files) || !files.length) {
    throw new HttpError(
      400,
      'Choose at least one file to yeeet.',
      'empty_manifest',
    )
  }
  if (files.length > MAX_FILE_COUNT) {
    throw new HttpError(
      413,
      `A deployment may contain at most ${MAX_FILE_COUNT.toLocaleString()} files.`,
      'too_many_files',
    )
  }

  const seen = new Set<string>()
  const normalized = files.map((file) => {
    const path = normalizeFilePath(file.path)
    if (seen.has(path)) {
      throw new HttpError(400, `Duplicate file path: ${path}`, 'duplicate_path')
    }
    seen.add(path)
    if (!Number.isSafeInteger(file.size) || file.size < 0) {
      throw new HttpError(400, `Invalid size for ${path}.`, 'invalid_size')
    }
    const checksum = file.checksum?.trim().toLowerCase()
    if (checksum && !SHA256.test(checksum)) {
      throw new HttpError(
        400,
        `Invalid SHA-256 checksum for ${path}.`,
        'invalid_checksum',
      )
    }
    return {
      path,
      size: file.size,
      contentType: (file.contentType || 'application/octet-stream').slice(
        0,
        255,
      ),
      checksum,
    }
  })

  const totalBytes = normalized.reduce((sum, file) => sum + file.size, 0)
  const maxBytes = Number(process.env.MAX_DEPLOY_BYTES ?? 500 * 1024 * 1024)
  if (totalBytes > maxBytes) {
    throw new HttpError(
      413,
      `This deployment is larger than the ${Math.floor(maxBytes / 1024 / 1024)} MB limit.`,
      'deployment_too_large',
    )
  }
  return { files: normalized, totalBytes }
}

async function inBatches<T, TResult>(
  values: Array<T>,
  size: number,
  worker: (value: T) => Promise<TResult>,
) {
  const results: Array<TResult> = []
  for (let index = 0; index < values.length; index += size) {
    results.push(
      ...(await Promise.all(values.slice(index, index + size).map(worker))),
    )
  }
  return results
}

export async function createDeployment(input: {
  actor: Actor
  slug?: string
  files: Array<ManifestFile>
  source: 'web' | 'cli' | 'api'
  spaFallback?: boolean
  password?: string
}) {
  const manifest = validateManifest(input.files)
  const passwordHash = input.password
    ? await hashDeploymentPassword(input.password)
    : null
  const requestedSlug = input.slug?.trim()
  let slug = requestedSlug ? normalizeSlug(requestedSlug) : generateRandomSlug()
  let existing = await db.query.sites.findFirst({
    where: eq(sites.slug, slug),
  })
  for (
    let attempt = 0;
    !requestedSlug && existing && attempt < 8;
    attempt += 1
  ) {
    slug = generateRandomSlug()
    existing = await db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  }
  if (!requestedSlug && existing) {
    throw new HttpError(
      503,
      'Could not reserve a random site name. Try again.',
      'slug_generation_failed',
    )
  }

  if (existing && existing.userId !== input.actor.userId) {
    throw new HttpError(409, 'That site name is already flying.', 'slug_taken')
  }

  const siteId = existing?.id ?? randomUUID()
  const deploymentId = randomUUID()
  const shareNonce = generateShareNonce()
  const checksums = [
    ...new Set(
      manifest.files.flatMap((file) => (file.checksum ? [file.checksum] : [])),
    ),
  ]
  const reusableRows = checksums.length
    ? await db
        .select({
          checksum: deploymentFiles.checksum,
          size: deploymentFiles.size,
          storageKey: deploymentFiles.storageKey,
        })
        .from(deploymentFiles)
        .innerJoin(
          deployments,
          eq(deploymentFiles.deploymentId, deployments.id),
        )
        .where(
          and(
            eq(deployments.userId, input.actor.userId),
            eq(deployments.status, 'ready'),
            inArray(deploymentFiles.checksum, checksums),
          ),
        )
        .orderBy(desc(deployments.createdAt))
    : []
  const reusableByContent = new Map<string, string>()
  for (const row of reusableRows) {
    if (!row.checksum) continue
    const key = `${row.checksum}:${row.size}`
    if (!reusableByContent.has(key)) {
      reusableByContent.set(key, row.storageKey)
    }
  }
  const filePlans = manifest.files.map((file) => ({
    row: {
      id: randomUUID(),
      deploymentId,
      path: file.path,
      storageKey: `sites/${siteId}/deployments/${deploymentId}/${file.path}`,
      contentType: file.contentType,
      size: file.size,
      checksum: file.checksum,
    },
    reuseSource: file.checksum
      ? reusableByContent.get(`${file.checksum}:${file.size}`)
      : undefined,
  }))
  const fileRows = filePlans.map((plan) => plan.row)

  await db.transaction(async (tx) => {
    if (!existing) {
      await tx
        .insert(sites)
        .values({ id: siteId, slug, userId: input.actor.userId })
    }
    await tx.insert(deployments).values({
      id: deploymentId,
      siteId,
      userId: input.actor.userId,
      status: 'uploading',
      source: input.source,
      fileCount: fileRows.length,
      totalBytes: manifest.totalBytes,
      spaFallback: input.spaFallback ?? true,
      passwordHash,
      shareNonce,
    })
    for (let index = 0; index < fileRows.length; index += 500) {
      await tx
        .insert(deploymentFiles)
        .values(fileRows.slice(index, index + 500))
    }
  })

  try {
    const copiedPaths = new Set<string>()
    await inBatches(
      filePlans.filter((plan) => plan.reuseSource),
      20,
      async (plan) => {
        try {
          await copyStoredObject({
            sourceKey: plan.reuseSource!,
            targetKey: plan.row.storageKey,
            contentType: plan.row.contentType,
            deploymentId,
          })
          copiedPaths.add(plan.row.path)
        } catch (error) {
          console.warn(
            'Could not reuse deployment object; requesting upload.',
            {
              deploymentId,
              path: plan.row.path,
              error,
            },
          )
        }
      },
    )
    const uploadFiles = fileRows.filter((file) => !copiedPaths.has(file.path))
    const uploadUrls = await inBatches(uploadFiles, 25, async (file) => ({
      path: file.path,
      method: 'PUT' as const,
      headers: { 'content-type': file.contentType },
      url: await createUploadUrl({
        key: file.storageKey,
        contentType: file.contentType,
        deploymentId,
      }),
    }))

    return {
      id: deploymentId,
      site: slug,
      status: 'uploading' as const,
      spaFallback: input.spaFallback ?? true,
      protected: Boolean(passwordHash),
      reusedFiles: copiedPaths.size,
      uploadedFiles: uploadFiles.length,
      uploadUrls,
      completeUrl: `/api/v1/deployments/${deploymentId}/complete`,
    }
  } catch (error) {
    await db
      .update(deployments)
      .set({ status: 'failed', error: 'Could not create upload URLs.' })
      .where(eq(deployments.id, deploymentId))
    throw error
  }
}

export async function completeDeployment(actor: Actor, deploymentId: string) {
  const deployment = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.id, deploymentId),
      eq(deployments.userId, actor.userId),
    ),
    with: { files: true, site: true },
  })

  if (!deployment) {
    throw new HttpError(404, 'Deployment not found.', 'not_found')
  }
  if (deployment.status === 'ready') {
    return deploymentResult(
      deployment.site.slug,
      deployment.id,
      deployment.spaFallback,
      deployment.passwordHash,
      deployment.shareNonce,
    )
  }
  if (deployment.status === 'failed') {
    throw new HttpError(409, 'This deployment has failed.', 'deployment_failed')
  }

  const checks = await inBatches(deployment.files, 20, async (file) => {
    try {
      const object = await headStoredObject(file.storageKey)
      return {
        file,
        ok: Number(object.ContentLength) === file.size,
        etag: object.ETag?.replaceAll('"', ''),
      }
    } catch {
      return { file, ok: false, etag: undefined }
    }
  })
  const missing = checks
    .filter((check) => !check.ok)
    .map((check) => check.file.path)
  if (missing.length) {
    throw new HttpError(
      422,
      `${missing.length} file${missing.length === 1 ? ' is' : 's are'} still uploading.`,
      'incomplete_upload',
      { missing: missing.slice(0, 25) },
    )
  }

  const ruleFiles = new Map(deployment.files.map((file) => [file.path, file]))
  const readRuleFile = async (path: string) => {
    const file = ruleFiles.get(path)
    if (!file) return ''
    const object = await getStoredObject(file.storageKey)
    return (await object.Body?.transformToString()) ?? ''
  }
  const [headerRules, redirectRules] = await Promise.all([
    readRuleFile(HEADERS_FILE).then(parseHeaderRules),
    readRuleFile(REDIRECTS_FILE).then(parseRedirectRules),
  ])

  await db.transaction(async (tx) => {
    for (const check of checks) {
      if (check.etag) {
        await tx
          .update(deploymentFiles)
          .set({ etag: check.etag })
          .where(eq(deploymentFiles.id, check.file.id))
      }
    }
    await tx
      .update(deployments)
      .set({
        status: 'ready',
        completedAt: new Date(),
        activatedAt: new Date(),
        error: null,
        headerRules: JSON.stringify(headerRules),
        redirectRules: JSON.stringify(redirectRules),
      })
      .where(eq(deployments.id, deployment.id))
    await tx
      .update(sites)
      .set({ activeDeploymentId: deployment.id, updatedAt: new Date() })
      .where(eq(sites.id, deployment.siteId))
  })

  return deploymentResult(
    deployment.site.slug,
    deployment.id,
    deployment.spaFallback,
    deployment.passwordHash,
    deployment.shareNonce,
  )
}

function deploymentResult(
  slug: string,
  deploymentId: string,
  spaFallback: boolean,
  passwordHash: string | null,
  shareNonce: string,
) {
  return {
    id: deploymentId,
    site: slug,
    status: 'ready' as const,
    url: siteUrl(slug),
    versionUrl: versionUrl(deploymentId),
    spaFallback,
    protected: Boolean(passwordHash),
    shareUrl: passwordHash ? shareUrl(deploymentId, shareNonce) : null,
  }
}

export async function listSiteVersions(userId: string, value: string) {
  const slug = normalizeSlug(value)
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.slug, slug), eq(sites.userId, userId)),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')

  const rows = await db
    .select({
      id: deployments.id,
      status: deployments.status,
      source: deployments.source,
      fileCount: deployments.fileCount,
      totalBytes: deployments.totalBytes,
      createdAt: deployments.createdAt,
      completedAt: deployments.completedAt,
      activatedAt: deployments.activatedAt,
      error: deployments.error,
      spaFallback: deployments.spaFallback,
      passwordHash: deployments.passwordHash,
      shareNonce: deployments.shareNonce,
    })
    .from(deployments)
    .where(eq(deployments.siteId, site.id))
    .orderBy(desc(deployments.createdAt))
    .limit(100)

  return {
    site: {
      id: site.id,
      slug,
      url: siteUrl(slug),
      activeDeploymentId: site.activeDeploymentId,
    },
    versions: rows.map(({ passwordHash, shareNonce, ...row }) => ({
      ...row,
      current: row.id === site.activeDeploymentId,
      previewUrl: row.status === 'ready' ? versionUrl(row.id) : null,
      protected: Boolean(passwordHash),
      shareUrl:
        row.status === 'ready' && passwordHash
          ? shareUrl(row.id, shareNonce)
          : null,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
      activatedAt: row.activatedAt?.toISOString() ?? null,
    })),
  }
}

export async function activateSiteVersion(
  userId: string,
  value: string,
  selector: string,
) {
  const history = await listSiteVersions(userId, value)
  const version = resolveSiteVersion(history.versions, selector)
  if (version.status !== 'ready') {
    throw new HttpError(
      409,
      'Only a ready version can be made live.',
      'version_not_ready',
    )
  }

  const activatedAt = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({ activeDeploymentId: version.id, updatedAt: activatedAt })
      .where(and(eq(sites.id, history.site.id), eq(sites.userId, userId)))
    await tx
      .update(deployments)
      .set({ activatedAt })
      .where(eq(deployments.id, version.id))
  })

  return {
    id: version.id,
    site: history.site.slug,
    status: 'ready' as const,
    url: history.site.url,
    versionUrl: version.previewUrl,
    activatedAt: activatedAt.toISOString(),
  }
}

function resolveSiteVersion<TVersion extends { id: string }>(
  versions: Array<TVersion>,
  selector: string,
) {
  const normalizedSelector = selector.trim().toLowerCase()
  if (normalizedSelector.length < 8) {
    throw new HttpError(
      400,
      'Use at least 8 characters of the version ID.',
      'invalid_version',
    )
  }
  const matches = versions.filter(
    (version) =>
      version.id === normalizedSelector ||
      version.id.startsWith(normalizedSelector),
  )
  if (matches.length !== 1) {
    throw new HttpError(
      matches.length ? 409 : 404,
      matches.length
        ? 'That version prefix is ambiguous.'
        : 'Version not found.',
      matches.length ? 'ambiguous_version' : 'not_found',
    )
  }
  return matches[0]
}

export async function updateSiteVersionAccess(
  userId: string,
  value: string,
  selector: string,
  input: { password?: string | null; rotateShareLink?: boolean },
) {
  if (input.password === undefined && !input.rotateShareLink) {
    throw new HttpError(
      400,
      'Choose a password change or rotate the share link.',
      'invalid_access_update',
    )
  }
  const history = await listSiteVersions(userId, value)
  const version = resolveSiteVersion(history.versions, selector)
  const changes: {
    passwordHash?: string | null
    shareNonce?: string
  } = {}
  if (input.password !== undefined) {
    changes.passwordHash =
      input.password === null
        ? null
        : await hashDeploymentPassword(input.password)
    changes.shareNonce = generateShareNonce()
  }
  if (input.rotateShareLink) changes.shareNonce = generateShareNonce()

  const updatedRows = await db
    .update(deployments)
    .set(changes)
    .where(and(eq(deployments.id, version.id), eq(deployments.userId, userId)))
    .returning({
      id: deployments.id,
      status: deployments.status,
      passwordHash: deployments.passwordHash,
      shareNonce: deployments.shareNonce,
    })
  const updated = updatedRows.at(0)
  if (!updated) throw new HttpError(404, 'Version not found.', 'not_found')

  return {
    id: updated.id,
    site: history.site.slug,
    protected: Boolean(updated.passwordHash),
    shareUrl:
      updated.status === 'ready' && updated.passwordHash
        ? shareUrl(updated.id, updated.shareNonce)
        : null,
  }
}

export async function deleteSiteVersion(
  userId: string,
  value: string,
  selector: string,
) {
  const history = await listSiteVersions(userId, value)
  const version = resolveSiteVersion(history.versions, selector)
  const wasActive = version.id === history.site.activeDeploymentId
  const replacement = wasActive
    ? history.versions.find(
        (candidate) =>
          candidate.id !== version.id && candidate.status === 'ready',
      )
    : undefined

  const deletedObjects = await deleteStoredPrefix(
    `sites/${history.site.id}/deployments/${version.id}/`,
  )
  const changedAt = new Date()
  await db.transaction(async (tx) => {
    if (wasActive) {
      await tx
        .update(sites)
        .set({
          activeDeploymentId: replacement?.id ?? null,
          updatedAt: changedAt,
        })
        .where(and(eq(sites.id, history.site.id), eq(sites.userId, userId)))
      if (replacement) {
        await tx
          .update(deployments)
          .set({ activatedAt: changedAt })
          .where(eq(deployments.id, replacement.id))
      }
    }
    await tx
      .delete(deployments)
      .where(
        and(eq(deployments.id, version.id), eq(deployments.userId, userId)),
      )
  })

  return {
    id: version.id,
    site: history.site.slug,
    wasActive,
    activeDeploymentId: wasActive
      ? (replacement?.id ?? null)
      : history.site.activeDeploymentId,
    deletedObjects,
  }
}

export async function deleteOwnedSite(userId: string, value: string) {
  const slug = normalizeSlug(value)
  const site = await db.query.sites.findFirst({
    where: and(eq(sites.slug, slug), eq(sites.userId, userId)),
  })
  if (!site) throw new HttpError(404, 'Site not found.', 'not_found')

  const domains = await db.query.customDomains.findMany({
    where: eq(customDomains.siteId, site.id),
  })
  await Promise.all(
    domains.map((domain) => removeRailwayCustomDomain(domain.railwayDomainId)),
  )
  const deletedObjects = await deleteStoredPrefix(`sites/${site.id}/`)
  await db
    .delete(sites)
    .where(and(eq(sites.id, site.id), eq(sites.userId, userId)))

  return {
    id: site.id,
    slug: site.slug,
    deletedObjects,
    customDomains: domains.map((domain) => domain.hostname),
  }
}

export async function listSites(userId: string) {
  const rows = await db
    .select({
      id: sites.id,
      slug: sites.slug,
      activeDeploymentId: sites.activeDeploymentId,
      updatedAt: sites.updatedAt,
      fileCount: deployments.fileCount,
      totalBytes: deployments.totalBytes,
      source: deployments.source,
      spaFallback: deployments.spaFallback,
      passwordHash: deployments.passwordHash,
      shareNonce: deployments.shareNonce,
    })
    .from(sites)
    .leftJoin(deployments, eq(sites.activeDeploymentId, deployments.id))
    .where(eq(sites.userId, userId))
    .orderBy(desc(sites.updatedAt))

  return rows.map(({ passwordHash, shareNonce, ...row }) => ({
    ...row,
    updatedAt: row.updatedAt.toISOString(),
    url: siteUrl(row.slug),
    protected: Boolean(passwordHash),
    shareUrl:
      row.activeDeploymentId && passwordHash && shareNonce !== null
        ? shareUrl(row.activeDeploymentId, shareNonce)
        : null,
  }))
}

export async function listRecentDeployments(userId: string) {
  const rows = await db
    .select({
      id: deployments.id,
      slug: sites.slug,
      status: deployments.status,
      source: deployments.source,
      fileCount: deployments.fileCount,
      totalBytes: deployments.totalBytes,
      createdAt: deployments.createdAt,
    })
    .from(deployments)
    .innerJoin(sites, eq(deployments.siteId, sites.id))
    .where(eq(deployments.userId, userId))
    .orderBy(desc(deployments.createdAt))
    .limit(12)

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

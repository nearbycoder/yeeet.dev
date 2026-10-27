// Fetches deployment backends from the control plane and caches them on disk.

import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { signContext } from './auth.js'
import {
  BACKEND_DIRECTORY,
  BACKEND_ENTRIES,
  MIGRATION_NAME,
} from './backend-layout.js'
import { RuntimeError, UUID } from './site-store.js'

const BUNDLE_FORMAT = 1

function safeSourcePath(path) {
  if (typeof path !== 'string') return false
  const parts = path.split('/')
  return (
    (BACKEND_ENTRIES.includes(path) || path.startsWith(BACKEND_DIRECTORY)) &&
    parts.every((part) => part && part !== '.' && part !== '..') &&
    !path.includes('\0') &&
    !path.includes('\\')
  )
}

export class BundleStore {
  constructor({ dataDir, controlPlaneUrl, secret, sites, fetchImpl = fetch }) {
    this.root = join(dataDir, 'bundles')
    this.controlPlaneUrl = controlPlaneUrl
    this.secret = secret
    this.sites = sites
    this.fetch = fetchImpl
    this.loading = new Map()
  }

  directory(deploymentId) {
    if (!UUID.test(deploymentId))
      throw new RuntimeError(
        400,
        'invalid_deployment',
        'Invalid deployment id.',
      )
    return join(this.root, deploymentId)
  }

  read(deploymentId) {
    const dir = this.directory(deploymentId)
    const metadataPath = join(dir, 'bundle.json')
    if (!existsSync(metadataPath)) return null
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
    if (metadata.format !== BUNDLE_FORMAT) return null
    const now = new Date()
    utimesSync(metadataPath, now, now)
    return {
      ...metadata,
      dir,
      sourceDir: join(dir, 'src'),
      entryPath: join(dir, 'src', metadata.entry),
    }
  }

  /** Return the cached bundle, downloading it once when it is missing. */
  async get(deploymentId, siteId) {
    const cached = this.read(deploymentId)
    if (cached) {
      if (cached.siteId !== siteId)
        throw new RuntimeError(
          403,
          'bundle_site_mismatch',
          'This deployment belongs to another site.',
        )
      return cached
    }
    let pending = this.loading.get(deploymentId)
    if (!pending) {
      pending = this.download(deploymentId).finally(() =>
        this.loading.delete(deploymentId),
      )
      this.loading.set(deploymentId, pending)
    }
    const bundle = await pending
    if (bundle.siteId !== siteId)
      throw new RuntimeError(
        403,
        'bundle_site_mismatch',
        'This deployment belongs to another site.',
      )
    return bundle
  }

  async download(deploymentId) {
    const dir = this.directory(deploymentId)
    let response
    try {
      response = await this.fetch(
        `${this.controlPlaneUrl}/_yeeet/runtime/bundles/${deploymentId}`,
        {
          headers: signContext(this.secret, { op: 'bundle', deploymentId }),
          signal: AbortSignal.timeout(30_000),
        },
      )
    } catch (error) {
      throw new RuntimeError(
        503,
        'bundle_unavailable',
        `Could not reach the control plane for the backend bundle: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (response.status === 404)
      throw new RuntimeError(
        404,
        'bundle_not_found',
        'This deployment has no backend.',
      )
    if (!response.ok)
      throw new RuntimeError(
        503,
        'bundle_unavailable',
        `The control plane returned ${response.status} for the backend bundle.`,
      )
    const body = await response.json()
    if (
      body.deploymentId !== deploymentId ||
      !UUID.test(body.siteId) ||
      !BACKEND_ENTRIES.includes(body.entry) ||
      !Array.isArray(body.files) ||
      !Array.isArray(body.migrations) ||
      !body.files.some((file) => file.path === body.entry) ||
      body.files.some(
        (file) =>
          !safeSourcePath(file.path) || typeof file.content !== 'string',
      ) ||
      body.migrations.some(
        (migration) =>
          !MIGRATION_NAME.test(migration.name) ||
          typeof migration.sql !== 'string',
      )
    )
      throw new RuntimeError(
        502,
        'invalid_bundle',
        'The control plane returned an invalid backend bundle.',
      )

    const owner = this.sites.user(body.siteId)
    const staging = join(this.root, `.tmp-${randomUUID()}`)
    try {
      const sourceDir = join(staging, 'src')
      mkdirSync(sourceDir, { recursive: true })
      for (const file of body.files) {
        const target = join(sourceDir, file.path)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, file.content)
      }
      writeFileSync(
        join(staging, 'bundle.json'),
        JSON.stringify({
          format: BUNDLE_FORMAT,
          deploymentId,
          siteId: body.siteId,
          slug: body.slug,
          entry: body.entry,
          migrations: body.migrations.map(({ name, sql }) => ({ name, sql })),
        }),
      )
      lockDown(staging, owner)
      rmSync(dir, { recursive: true, force: true })
      renameSync(staging, dir)
    } catch (error) {
      rmSync(staging, { recursive: true, force: true })
      throw error
    }
    return this.read(deploymentId)
  }

  /** Remove bundles that have not been used recently; they are re-fetched on demand. */
  collectGarbage(maxAgeMs, inUse) {
    if (!existsSync(this.root)) return 0
    let removed = 0
    for (const name of readdirSync(this.root)) {
      const path = join(this.root, name)
      if (name.startsWith('.tmp-')) {
        if (Date.now() - statSync(path).mtimeMs > 60 * 60_000) {
          rmSync(path, { recursive: true, force: true })
        }
        continue
      }
      if (!UUID.test(name) || inUse.has(name)) continue
      const metadata = join(path, 'bundle.json')
      const age = existsSync(metadata)
        ? Date.now() - statSync(metadata).mtimeMs
        : Infinity
      if (age > maxAgeMs) {
        rmSync(path, { recursive: true, force: true })
        removed += 1
      }
    }
    return removed
  }
}

/** Root owns bundle files; the site's group may read but never modify them. */
function lockDown(path, owner) {
  const isDirectory = statSync(path).isDirectory()
  if (owner) chownSync(path, 0, owner.gid)
  chmodSync(path, isDirectory ? (owner ? 0o750 : 0o755) : owner ? 0o640 : 0o644)
  if (!isDirectory) return
  for (const entry of readdirSync(path)) lockDown(join(path, entry), owner)
}

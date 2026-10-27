// On-disk layout for runtime state and per-site OS users.
//
//   <data>/runtime.sqlite                       root-only uid allocations
//   <data>/sites/<siteId>/db/<database>.sqlite  owned by the site's uid
//   <data>/sites/<siteId>/r/                    worker unix sockets
//   <data>/sites/<siteId>/tmp/                  scratch and migration rehearsals
//   <data>/backups/<siteId>/<database>/         root-only; workers cannot delete backups
//   <data>/bundles/<deploymentId>/              root-owned, readable by the site's group

import { Database } from 'bun:sqlite'
import {
  chmodSync,
  chownSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join } from 'node:path'

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const DATABASE_NAME =
  /^(?:live|dev|channel-[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?|version-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
const FIRST_SITE_UID = 200_000

export class RuntimeError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function assertSiteId(value) {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new RuntimeError(400, 'invalid_site', 'Invalid site id.')
  return value
}

export function assertDatabaseName(value) {
  if (typeof value !== 'string' || !DATABASE_NAME.test(value))
    throw new RuntimeError(400, 'invalid_database', 'Invalid database name.')
  return value
}

function ensureDirectory(path, mode, owner) {
  mkdirSync(path, { recursive: true, mode })
  chmodSync(path, mode)
  if (owner) chownSync(path, owner.uid, owner.gid)
}

export class SiteStore {
  constructor({ dataDir, isolation }) {
    this.dataDir = dataDir
    this.isolation = isolation
    ensureDirectory(dataDir, 0o711)
    ensureDirectory(join(dataDir, 'sites'), 0o711)
    ensureDirectory(join(dataDir, 'backups'), 0o700)
    ensureDirectory(join(dataDir, 'bundles'), 0o711)
    this.state = new Database(join(dataDir, 'runtime.sqlite'), { create: true })
    chmodSync(join(dataDir, 'runtime.sqlite'), 0o600)
    this.state.run('PRAGMA journal_mode = WAL')
    this.state.run(
      'CREATE TABLE IF NOT EXISTS site_users (uid INTEGER PRIMARY KEY AUTOINCREMENT, site_id TEXT NOT NULL UNIQUE)',
    )
  }

  /** The OS user a site's worker runs as, or null when isolation is off. */
  user(siteId) {
    if (!this.isolation) return null
    assertSiteId(siteId)
    this.state
      .query('INSERT OR IGNORE INTO site_users (site_id) VALUES (?)')
      .run(siteId)
    const row = this.state
      .query('SELECT uid FROM site_users WHERE site_id = ?')
      .get(siteId)
    const id = FIRST_SITE_UID + row.uid
    return { uid: id, gid: id }
  }

  siteDir(siteId) {
    return join(this.dataDir, 'sites', assertSiteId(siteId))
  }

  databaseDir(siteId) {
    return join(this.siteDir(siteId), 'db')
  }

  databasePath(siteId, database) {
    return join(
      this.databaseDir(siteId),
      `${assertDatabaseName(database)}.sqlite`,
    )
  }

  socketDir(siteId) {
    return join(this.siteDir(siteId), 'r')
  }

  tmpDir(siteId) {
    return join(this.siteDir(siteId), 'tmp')
  }

  backupDir(siteId, database) {
    return join(
      this.dataDir,
      'backups',
      assertSiteId(siteId),
      assertDatabaseName(database),
    )
  }

  ensureSite(siteId) {
    const owner = this.user(siteId)
    ensureDirectory(this.siteDir(siteId), 0o700, owner)
    for (const path of [
      this.databaseDir(siteId),
      this.socketDir(siteId),
      this.tmpDir(siteId),
    ])
      ensureDirectory(path, 0o700, owner)
    return owner
  }

  /** Give files created by root (migrations, restores) back to the site's user. */
  restoreOwnership(siteId, path = this.siteDir(siteId)) {
    const owner = this.user(siteId)
    if (!owner || !existsSync(path)) return
    chownSync(path, owner.uid, owner.gid)
    if (!statSync(path).isDirectory()) return
    for (const entry of readdirSync(path)) {
      this.restoreOwnership(siteId, join(path, entry))
    }
  }

  databases(siteId) {
    const dir = this.databaseDir(siteId)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((name) => name.endsWith('.sqlite'))
      .map((name) => name.slice(0, -'.sqlite'.length))
      .filter((name) => DATABASE_NAME.test(name))
      .sort()
  }

  removeDatabase(siteId, database) {
    const path = this.databasePath(siteId, database)
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(`${path}${suffix}`, { force: true })
  }

  removeSite(siteId) {
    rmSync(this.siteDir(siteId), { recursive: true, force: true })
    rmSync(join(this.dataDir, 'backups', assertSiteId(siteId)), {
      recursive: true,
      force: true,
    })
  }
}

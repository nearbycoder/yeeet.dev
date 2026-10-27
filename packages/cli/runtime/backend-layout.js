// Shared backend layout rules. This file is copied byte-for-byte into
// packages/cli/runtime; tests/backend-layout.test.ts keeps the copies identical.

export const BACKEND_ENTRIES = ['_server.ts', '_server.js']
export const BACKEND_DIRECTORY = '_server/'
export const MIGRATIONS_DIRECTORY = '_migrations/'
export const BACKEND_ROUTE_PREFIX = '/api'
export const MAX_BACKEND_FILES = 200
export const MAX_BACKEND_BYTES = 5 * 1024 * 1024
export const MAX_MIGRATIONS = 500
export const MAX_MIGRATION_BYTES = 1024 * 1024
export const MIGRATION_NAME =
  /^(\d{1,12})_([A-Za-z0-9][A-Za-z0-9_.-]{0,100})\.sql$/

export class BackendLayoutError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'BackendLayoutError'
    this.code = code
  }
}

/** Paths that belong to the backend and must never be served as static assets. */
export function isPrivateBackendPath(path) {
  const clean = String(path).replace(/^\/+/, '')
  return (
    BACKEND_ENTRIES.includes(clean) ||
    clean.startsWith(BACKEND_DIRECTORY) ||
    clean.startsWith(MIGRATIONS_DIRECTORY)
  )
}

/** Request paths handled by a site's backend: /api and everything below it. */
export function isBackendRoute(pathname) {
  return (
    pathname === BACKEND_ROUTE_PREFIX ||
    pathname.startsWith(`${BACKEND_ROUTE_PREFIX}/`)
  )
}

export function compareMigrationNames(left, right) {
  const leftMatch = MIGRATION_NAME.exec(left)
  const rightMatch = MIGRATION_NAME.exec(right)
  const leftNumber = leftMatch ? BigInt(leftMatch[1]) : 0n
  const rightNumber = rightMatch ? BigInt(rightMatch[1]) : 0n
  if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Describe the backend contained in a deployment manifest.
 * Returns null for a purely static deployment.
 *
 * @param {Array<{ path: string, size: number }>} files
 */
export function describeBackend(files) {
  const entries = files.filter((file) => BACKEND_ENTRIES.includes(file.path))
  const sources = files.filter((file) =>
    file.path.startsWith(BACKEND_DIRECTORY),
  )
  const migrationFiles = files.filter((file) =>
    file.path.startsWith(MIGRATIONS_DIRECTORY),
  )
  if (!entries.length && !sources.length && !migrationFiles.length) return null
  if (entries.length > 1) {
    throw new BackendLayoutError(
      'backend_entry_conflict',
      'Use either _server.ts or _server.js as the backend entry, not both.',
    )
  }
  const entry = entries.at(0)
  if (!entry) {
    throw new BackendLayoutError(
      'backend_entry_missing',
      '_server/ and _migrations/ require a _server.ts (or _server.js) entry at the deployment root.',
    )
  }

  const backendFiles = [entry, ...sources]
  if (backendFiles.length > MAX_BACKEND_FILES) {
    throw new BackendLayoutError(
      'backend_too_many_files',
      `A backend may contain at most ${MAX_BACKEND_FILES} files (_server.ts plus _server/).`,
    )
  }
  const backendBytes = backendFiles.reduce((sum, file) => sum + file.size, 0)
  if (backendBytes > MAX_BACKEND_BYTES) {
    throw new BackendLayoutError(
      'backend_too_large',
      `Backend source may not exceed ${MAX_BACKEND_BYTES / 1024 / 1024} MB. Bundle dependencies with \`bun build --target=bun\` and keep assets in static files.`,
    )
  }

  const migrations = []
  for (const file of migrationFiles) {
    const name = file.path.slice(MIGRATIONS_DIRECTORY.length)
    if (!name.toLowerCase().endsWith('.sql')) continue
    if (name.includes('/')) {
      throw new BackendLayoutError(
        'invalid_migration_name',
        `${file.path}: migrations must sit directly inside _migrations/.`,
      )
    }
    if (!MIGRATION_NAME.test(name)) {
      throw new BackendLayoutError(
        'invalid_migration_name',
        `${file.path}: name migrations like 0001_create_todos.sql (a number, an underscore, a name, and .sql).`,
      )
    }
    if (file.size > MAX_MIGRATION_BYTES) {
      throw new BackendLayoutError(
        'migration_too_large',
        `${file.path} is larger than ${MAX_MIGRATION_BYTES / 1024} KB.`,
      )
    }
    migrations.push({ name, path: file.path })
  }
  if (migrations.length > MAX_MIGRATIONS) {
    throw new BackendLayoutError(
      'too_many_migrations',
      `A backend may contain at most ${MAX_MIGRATIONS} migrations.`,
    )
  }
  migrations.sort((left, right) => compareMigrationNames(left.name, right.name))

  return {
    entry: entry.path,
    files: backendFiles.map((file) => file.path).sort(),
    migrations,
    bytes: backendBytes,
  }
}

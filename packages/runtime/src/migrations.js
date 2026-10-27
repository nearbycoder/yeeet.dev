// Forward-only SQLite migrations for Yeeet backends. Runs under Bun.
// This file is copied byte-for-byte into packages/cli/runtime; keep them equal.

import { createHash } from 'node:crypto'
import { compareMigrationNames } from './backend-layout.js'

export const MIGRATIONS_TABLE = '_yeeet_migrations'

export class MigrationError extends Error {
  constructor(code, message, migration) {
    super(message)
    this.name = 'MigrationError'
    this.code = code
    this.migration = migration ?? null
  }
}

export function migrationChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex')
}

/** @param {Array<{ name: string, sql: string }>} migrations */
export function normalizeMigrations(migrations) {
  return migrations
    .map((migration) => ({
      name: migration.name,
      sql: migration.sql,
      checksum: migrationChecksum(migration.sql),
    }))
    .sort((left, right) => compareMigrationNames(left.name, right.name))
}

export function ensureMigrationsTable(db) {
  db.run(
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      deployment_id TEXT,
      applied_at TEXT NOT NULL
    )`,
  )
}

export function appliedMigrations(db) {
  const exists = db
    .query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(MIGRATIONS_TABLE)
  if (!exists) return []
  return db
    .query(
      `SELECT name, checksum, deployment_id AS deploymentId, applied_at AS appliedAt FROM ${MIGRATIONS_TABLE}`,
    )
    .all()
    .sort((left, right) => compareMigrationNames(left.name, right.name))
}

/**
 * Compare a deployment's migrations with the database without changing it.
 * - pending: in the deployment, not yet applied
 * - changed: applied, but the file's contents differ from what ran
 * - unknown: applied, but absent from this deployment (for example after a rollback)
 */
export function planMigrations(db, migrations) {
  const wanted = normalizeMigrations(migrations)
  const applied = new Map(appliedMigrations(db).map((row) => [row.name, row]))
  const names = new Set(wanted.map((migration) => migration.name))
  const pending = wanted.filter((migration) => !applied.has(migration.name))
  const changed = wanted
    .filter(
      (migration) =>
        applied.has(migration.name) &&
        applied.get(migration.name).checksum !== migration.checksum,
    )
    .map((migration) => migration.name)
  const unknown = [...applied.keys()].filter((name) => !names.has(name))
  const lastApplied = [...applied.keys()].sort(compareMigrationNames).at(-1)
  const outOfOrder = lastApplied
    ? pending
        .filter(
          (migration) => compareMigrationNames(migration.name, lastApplied) < 0,
        )
        .map((migration) => migration.name)
    : []
  const warnings = [
    ...unknown.map(
      (name) =>
        `${name} was applied to this database but is not part of this deployment. Migrations are forward-only, so its schema changes remain.`,
    ),
    ...outOfOrder.map(
      (name) =>
        `${name} sorts before an already-applied migration and will run out of order.`,
    ),
  ]
  return {
    pending,
    applied: [...applied.values()],
    changed,
    unknown,
    warnings,
  }
}

/**
 * Apply every pending migration, each inside its own transaction.
 * Throws MigrationError without applying anything when an applied migration
 * was edited, and stops at the first failing migration.
 */
export function applyMigrations(db, migrations, options = {}) {
  ensureMigrationsTable(db)
  const plan = planMigrations(db, migrations)
  if (plan.changed.length) {
    throw new MigrationError(
      'migration_changed',
      `${plan.changed[0]} changed after it was applied to this database. Applied migrations are immutable: restore the original file and add a new migration instead.`,
      plan.changed[0],
    )
  }
  const record = db.prepare(
    `INSERT INTO ${MIGRATIONS_TABLE} (name, checksum, deployment_id, applied_at) VALUES (?, ?, ?, ?)`,
  )
  const appliedNow = []
  for (const migration of plan.pending) {
    try {
      db.transaction(() => {
        db.run(migration.sql)
        record.run(
          migration.name,
          migration.checksum,
          options.deploymentId ?? null,
          new Date().toISOString(),
        )
      })()
    } catch (error) {
      throw new MigrationError(
        'migration_failed',
        `${migration.name} failed: ${error instanceof Error ? error.message : String(error)}`,
        migration.name,
      )
    }
    appliedNow.push(migration.name)
  }
  return {
    applied: appliedNow,
    warnings: plan.warnings,
    total: plan.applied.length + appliedNow.length,
  }
}

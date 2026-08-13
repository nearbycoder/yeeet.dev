import { resolve } from 'node:path'
import process from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations.')
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder: resolve('drizzle') })
  console.log('Database migrations are current.')
} finally {
  await pool.end()
}

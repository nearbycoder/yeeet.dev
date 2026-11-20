import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run migrations.')
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
try {
  await migrate(drizzle(pool), { migrationsFolder })
  console.log('Database migrations are current.')
} finally {
  await pool.end()
}

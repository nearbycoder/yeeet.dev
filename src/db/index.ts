import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema.ts'

const globalForDatabase = globalThis as unknown as { yeeetPool?: Pool }

const pool =
  globalForDatabase.yeeetPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_SIZE ?? 10),
    idleTimeoutMillis: 30_000,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.yeeetPool = pool
}

export const db = drizzle(pool, { schema })

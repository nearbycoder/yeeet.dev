import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema.ts'

const globalForDatabase = globalThis as unknown as { yeeetPool?: Pool }

const parsedPoolSize = Number(process.env.DB_POOL_SIZE)
const poolSize =
  Number.isSafeInteger(parsedPoolSize) && parsedPoolSize > 0
    ? parsedPoolSize
    : 10

const pool =
  globalForDatabase.yeeetPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

if (!globalForDatabase.yeeetPool) {
  pool.on('error', (error) => {
    console.error('Postgres pool error', error)
  })
}

if (process.env.NODE_ENV !== 'production') {
  globalForDatabase.yeeetPool = pool
}

export const db = drizzle(pool, { schema })

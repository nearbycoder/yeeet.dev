import { resolve } from 'node:path'

function integer(name, fallback, minimum = 1) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new Error(`${name} must be an integer of at least ${minimum}.`)
  return value
}

export function runtimeConfig() {
  const secret = process.env.BACKEND_RUNTIME_SECRET ?? ''
  if (secret.length < 32)
    throw new Error(
      'BACKEND_RUNTIME_SECRET must be set to at least 32 characters (use the same value on the Yeeet app).',
    )
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL?.trim()
  if (!controlPlaneUrl)
    throw new Error(
      'CONTROL_PLANE_URL must point at the Yeeet app, for example http://yeeet.railway.internal:8080.',
    )
  const isolationSetting = (process.env.RUNTIME_ISOLATION || 'required').trim()
  if (!['required', 'auto', 'off'].includes(isolationSetting))
    throw new Error('RUNTIME_ISOLATION must be required, auto, or off.')
  const isRoot = process.getuid?.() === 0
  if (isolationSetting === 'required' && !isRoot)
    throw new Error(
      'RUNTIME_ISOLATION=required needs the runtime to start as root so it can drop each site to its own user.',
    )
  return {
    port: integer('PORT', 8080),
    hostname: process.env.HOST || '::',
    secret,
    controlPlaneUrl: controlPlaneUrl.replace(/\/+$/, ''),
    dataDir: resolve(process.env.DATA_DIR || '/data'),
    isolation: isolationSetting !== 'off' && isRoot,
    idleTimeoutMs: integer('RUNTIME_IDLE_TIMEOUT_MS', 5 * 60_000),
    maxWorkers: integer('RUNTIME_MAX_WORKERS', 32),
    maxMemoryMb: integer('RUNTIME_MAX_MEMORY_MB', 256),
    requestTimeoutMs: integer('RUNTIME_REQUEST_TIMEOUT_MS', 30_000),
    startTimeoutMs: integer('RUNTIME_START_TIMEOUT_MS', 10_000),
    backupsToKeep: integer('RUNTIME_BACKUPS_KEEP', 10),
    bunPath: process.env.RUNTIME_BUN_PATH || process.execPath,
  }
}

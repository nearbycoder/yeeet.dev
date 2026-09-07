import { z } from 'zod'

export type UploadFile = { path: string; file: File }
export const uploadRecoverySchema = z.object({
  version: z.literal(1),
  key: z.string().uuid(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.number(),
  slug: z.string().max(63),
  channel: z.string().max(32),
  spaFallback: z.boolean(),
  privateDeploy: z.boolean(),
})
export type UploadRecovery = z.infer<typeof uploadRecoverySchema>
export function recoveryStorageKey(userId: string) {
  return `yeeet-upload-v1:${userId}`
}
export function parseRecovery(value: string | null, now = Date.now()) {
  if (!value) return null
  try {
    const result = uploadRecoverySchema.parse(JSON.parse(value))
    return now - result.createdAt <= 7 * 86400000 && result.createdAt <= now
      ? result
      : null
  } catch {
    return null
  }
}
export async function recoveryFingerprint(value: unknown) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}
export function hashUploadFiles(
  files: Array<UploadFile>,
  signal: AbortSignal,
  progress: (completed: number) => void,
) {
  return new Promise<Map<string, string>>((resolve, reject) => {
    signal.throwIfAborted()
    const worker = new Worker(
      new URL('../workers/file-hash.ts', import.meta.url),
      { type: 'module' },
    )
    const close = () => {
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      close()
      reject(new DOMException('Upload paused.', 'AbortError'))
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => {
      close()
      reject(
        new Error(
          'File hashing failed. Retry or use a browser with Web Worker support.',
        ),
      )
    }
    worker.onmessage = (
      event: MessageEvent<{
        completed?: number
        checksums?: Array<[string, string]>
        error?: string
      }>,
    ) => {
      if (event.data.error) {
        close()
        reject(new Error(event.data.error))
      } else if (event.data.checksums) {
        close()
        resolve(new Map(event.data.checksums))
      } else if (event.data.completed !== undefined)
        progress(event.data.completed)
    }
    worker.postMessage({ files })
  })
}
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('Upload paused.', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
export async function retryUpload(
  action: () => Promise<void>,
  signal: AbortSignal,
  sleep = delay,
) {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted()
    try {
      await action()
      return
    } catch (error) {
      if (signal.aborted || attempt === 2) throw error
      await sleep(500 * 2 ** attempt, signal)
    }
  }
}
export async function uploadPool<T>(
  items: Array<T>,
  concurrency: number,
  signal: AbortSignal,
  action: (item: T) => Promise<void>,
) {
  let next = 0
  const state: { failed: boolean; error?: unknown } = { failed: false }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!state.failed && next < items.length) {
        const item = items[next++]
        try {
          signal.throwIfAborted()
          await action(item)
        } catch (error) {
          state.failed = true
          state.error = error
        }
      }
    }),
  )
  signal.throwIfAborted()
  if (state.failed) throw state.error
}

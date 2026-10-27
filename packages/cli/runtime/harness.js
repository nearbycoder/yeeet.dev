// Worker entry for one site backend. Runs under Bun as an isolated process.
// This file is copied byte-for-byte into packages/cli/runtime; keep them equal.
//
// Environment:
//   YEEET_ENTRY   absolute path to _server.ts or _server.js
//   YEEET_DB      SQLite database path
//   YEEET_SOCKET  unix socket to listen on
//   YEEET_SITE    JSON { slug, deploymentId, database }

import { Database } from 'bun:sqlite'
import { pathToFileURL } from 'node:url'

const INTERNAL_HEADERS = ['x-yeeet-url', 'x-yeeet-request-id']

function report(message) {
  if (process.send) process.send(message)
}

function resolveHandler(module) {
  const candidate = module.default ?? module
  if (typeof candidate === 'function') return candidate
  if (candidate && typeof candidate.fetch === 'function')
    return candidate.fetch.bind(candidate)
  return null
}

async function main() {
  const site = Object.freeze(JSON.parse(process.env.YEEET_SITE || '{}'))
  const db = new Database(process.env.YEEET_DB, { create: true })
  db.run('PRAGMA busy_timeout = 5000')
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
  db.run('PRAGMA synchronous = NORMAL')

  const module = await import(pathToFileURL(process.env.YEEET_ENTRY).href)
  const handler = resolveHandler(module)
  if (!handler) {
    throw new Error(
      '_server.ts must `export default { fetch(request, ctx) { … } }` or export a default function.',
    )
  }
  const context = Object.freeze({ db, site })

  Bun.serve({
    unix: process.env.YEEET_SOCKET,
    maxRequestBodySize: 10 * 1024 * 1024,
    idleTimeout: 0,
    async fetch(incoming) {
      const publicUrl = incoming.headers.get('x-yeeet-url') || incoming.url
      const headers = new Headers(incoming.headers)
      for (const name of INTERNAL_HEADERS) headers.delete(name)
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
      const request = new Request(publicUrl, {
        method: incoming.method,
        headers,
        body: hasBody ? incoming.body : null,
        signal: incoming.signal,
        redirect: 'manual',
      })
      try {
        const response = await handler(request, context)
        if (!(response instanceof Response)) {
          console.error(
            `[yeeet] ${request.method} ${new URL(publicUrl).pathname}: the handler must return a Response.`,
          )
          return Response.json(
            {
              error: {
                code: 'invalid_backend_response',
                message: 'The backend handler did not return a Response.',
              },
            },
            { status: 500 },
          )
        }
        return response
      } catch (error) {
        console.error(
          `[yeeet] ${request.method} ${new URL(publicUrl).pathname} threw:`,
          error,
        )
        return Response.json(
          {
            error: {
              code: 'backend_error',
              message: 'The backend handler threw an error.',
            },
          },
          { status: 500 },
        )
      }
    },
  })
  report({ type: 'ready' })
}

process.on('unhandledRejection', (error) => {
  console.error('[yeeet] unhandled rejection:', error)
})

main().catch((error) => {
  report({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
  })
  console.error('[yeeet] backend failed to start:', error)
  // Give the IPC message a moment to flush before exiting.
  setTimeout(() => process.exit(1), 50)
})

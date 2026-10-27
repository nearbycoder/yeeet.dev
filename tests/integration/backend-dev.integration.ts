import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const hasBun =
  spawnSync(process.env.YEEET_BUN || 'bun', ['--version']).status === 0

test(
  'CLI dev preserves writes across immediate restart and reloads migrations with existing data',
  {
    skip: !hasBun && 'Bun is not installed',
    timeout: 30_000,
  },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'yeeet-dev-integration-'))
    cpSync('examples/todo-backend', dir, { recursive: true })
    let child: ChildProcess | undefined

    async function start() {
      const server = spawn(process.execPath, [
        'packages/cli/bin/yeeet.js',
        'dev',
        dir,
        '--port',
        '0',
      ])
      child = server
      let output = ''
      return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Dev startup timed out: ${output}`)),
          15_000,
        )
        server.stdout.on('data', (chunk) => {
          output += String(chunk)
          const origin = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0]
          if (origin) {
            clearTimeout(timeout)
            resolve(origin)
          }
        })
        server.stderr.on('data', (chunk) => {
          output += String(chunk)
        })
        server.once('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`Dev exited ${code}: ${output}`))
        })
      })
    }

    async function stop() {
      if (!child || child.exitCode !== null || child.signalCode !== null) return
      const exited = once(child, 'exit')
      child.kill('SIGTERM')
      await exited
    }

    try {
      let origin = await start()
      assert.equal((await fetch(origin)).status, 200)
      assert.equal((await fetch(`${origin}/_server.ts`)).status, 404)
      const created = await fetch(`${origin}/api/todos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'survives restart' }),
      })
      assert.equal(created.status, 201)
      // Restart immediately after response headers; WAL recovery must wait for
      // SQLite locks before configuring journal mode in the new worker.
      await stop()
      origin = await start()
      const list = () =>
        fetch(`${origin}/api/todos`).then((response) => {
          assert.equal(response.status, 200)
          return response.json() as Promise<
            Array<{ title: string; priority?: number }>
          >
        })
      assert.equal((await list())[0].title, 'survives restart')

      writeFileSync(
        join(dir, '_migrations/0002_priority.sql'),
        'ALTER TABLE todos ADD COLUMN priority INTEGER NOT NULL DEFAULT 7;',
      )
      const deadline = Date.now() + 5_000
      let rows = await list()
      while (rows[0].priority !== 7 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        rows = await list()
      }
      assert.equal(rows[0].title, 'survives restart')
      assert.equal(rows[0].priority, 7)
    } finally {
      await stop()
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

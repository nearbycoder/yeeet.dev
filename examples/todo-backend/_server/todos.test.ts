// Run with: bun test ./_server
import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import app from '../_server.ts'

// A fresh in-memory database with every migration applied, like production.
function testContext() {
  const db = new Database(':memory:')
  const dir = join(import.meta.dir, '..', '_migrations')
  const names = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b))
  for (const name of names) db.run(readFileSync(join(dir, name), 'utf8'))
  return {
    db,
    site: { slug: 'test', deploymentId: 'test', database: 'test' },
  }
}

const call = (
  ctx: ReturnType<typeof testContext>,
  path: string,
  init?: RequestInit,
) => app.fetch(new Request(`https://test.local${path}`, init), ctx)

test('creates, lists, completes, and deletes todos', async () => {
  const ctx = testContext()
  const created = await call(ctx, '/api/todos', {
    method: 'POST',
    body: JSON.stringify({ title: 'Write tests' }),
  })
  expect(created.status).toBe(201)
  const todo = await created.json()
  expect(todo).toMatchObject({ id: 1, title: 'Write tests', done: 0 })

  const done = await call(ctx, `/api/todos/${todo.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ done: true }),
  })
  expect((await done.json()).done).toBe(1)

  expect(await (await call(ctx, '/api/todos')).json()).toHaveLength(1)
  expect(
    (await call(ctx, `/api/todos/${todo.id}`, { method: 'DELETE' })).status,
  ).toBe(204)
  expect(await (await call(ctx, '/api/todos')).json()).toEqual([])
})

test('rejects an empty title', async () => {
  const response = await call(testContext(), '/api/todos', {
    method: 'POST',
    body: JSON.stringify({ title: ' ' }),
  })
  expect(response.status).toBe(400)
})

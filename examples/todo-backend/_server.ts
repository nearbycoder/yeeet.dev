// Yeeet backend: every request to /api/* lands here. Everything else is static.
import type { Database } from 'bun:sqlite'

type Context = {
  db: Database
  site: { slug: string; deploymentId: string; database: string }
}

type Todo = { id: number; title: string; done: number; created_at: string }

function json(data: unknown, status = 200) {
  return Response.json(data, { status })
}

export default {
  async fetch(request: Request, { db }: Context): Promise<Response> {
    const url = new URL(request.url)
    const match = url.pathname.match(/^\/api\/todos(?:\/(\d+))?$/)

    if (url.pathname === '/api/health') return json({ ok: true })
    if (!match) return json({ error: 'Not found' }, 404)
    const id = match[1] ? Number(match[1]) : null

    if (request.method === 'GET' && id === null) {
      return json(db.query('SELECT * FROM todos ORDER BY id').all() as Todo[])
    }
    if (request.method === 'POST' && id === null) {
      const body = (await request.json().catch(() => null)) as {
        title?: unknown
      } | null
      const title = typeof body?.title === 'string' ? body.title.trim() : ''
      if (!title || title.length > 200)
        return json({ error: 'title must be 1–200 characters' }, 400)
      const todo = db
        .query('INSERT INTO todos (title) VALUES (?) RETURNING *')
        .get(title) as Todo
      return json(todo, 201)
    }
    if (request.method === 'PATCH' && id !== null) {
      const body = (await request.json().catch(() => null)) as {
        done?: unknown
      } | null
      const todo = db
        .query('UPDATE todos SET done = ? WHERE id = ? RETURNING *')
        .get(body?.done ? 1 : 0, id) as Todo | null
      return todo ? json(todo) : json({ error: 'Not found' }, 404)
    }
    if (request.method === 'DELETE' && id !== null) {
      const result = db.query('DELETE FROM todos WHERE id = ?').run(id)
      return result.changes
        ? new Response(null, { status: 204 })
        : json({ error: 'Not found' }, 404)
    }
    return json({ error: 'Method not allowed' }, 405)
  },
}

# Bun backends and SQLite

Yeeet can run a small server-side handler next to a static site. It is meant for state and simple APIs: forms, counters, todo lists, guest books, votes, small CRUD apps, webhooks you receive, and JSON endpoints for a static front end. The backend runs on Bun with a private SQLite database, starts on demand, and stops when idle, similar to a serverless function with a durable local database.

### When to use it

Use a backend when the site must remember something between requests or must keep logic off the client. Keep pure static sites static. A backend is not for long-running jobs, websockets, or large uploads.

### File layout

Everything lives in the folder you deploy:

    my-site/
      index.html                  static files, served as before
      app.js
      _server.ts                  backend entry (or _server.js); required for a backend
      _server/                    optional helper modules and tests, imported relatively
        todos.ts
        todos.test.ts
      _migrations/                optional SQL migrations
        0001_create_todos.sql
        0002_add_due_date.sql

_server.ts, everything under _server/, and everything under _migrations/ are private: the gateway never serves them, even when a URL names them. Your local .yeeet/ folder (created by yeeet dev) is never uploaded.

### Routing

- Requests to /api and /api/* with any method (GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD) run the backend.
- Every other path is served from static files exactly as before, including SPA fallback, _headers, and _redirects.
- A _redirects rewrite (status 200) whose target starts with /api also runs the backend, for example: /v1/* /api/:splat 200
- Password protection applies to /api too: protected deployments require the viewer cookie before the backend is called.
- Backend responses default to Cache-Control: private, no-store. Set your own Cache-Control header to allow caching on public deployments; protected deployments always remain private and uncached.

### Handler contract

_server.ts must default-export an object with a fetch method, or a function, that receives a standard Request and returns a standard Response (or a Promise of one):

    import type { Database } from 'bun:sqlite'

    type Context = {
      db: Database                      // this hostname's SQLite database (bun:sqlite), WAL mode, foreign_keys ON
      site: {
        slug: string                    // site name
        deploymentId: string            // the running release
        database: string                // 'live', 'channel-<name>', or 'version-<id>'
      }
    }

    export default {
      async fetch(request: Request, ctx: Context): Promise<Response> {
        // request.url is the public URL, for example https://comet.site.yeeet.dev/api/todos?done=1
      },
    }

- request.headers contain the visitor's headers (cookies, authorization, content-type, x-forwarded-for, x-forwarded-host). Yeeet's own access cookie is removed.
- Use ctx.db.query(sql).all(...params), .get(...params), and .run(...params). Always bind values with ? parameters; never build SQL from user input.
- Authenticate and validate requests in your handler when needed; a public API accepts requests from anyone.
- An uncaught exception returns 500 {"error":{"code":"backend_error"}} and is logged. Returning something that is not a Response returns 500 invalid_backend_response.
- Top-level code runs once per worker start. Do not keep important state in module variables: workers stop after a few idle minutes and restart on the next request.
- Write only to the database. The worker's file system is not durable.

### A complete example

    // _server.ts
    import type { Database } from 'bun:sqlite'

    type Context = { db: Database; site: { slug: string; deploymentId: string; database: string } }

    export default {
      async fetch(request: Request, { db }: Context): Promise<Response> {
        const url = new URL(request.url)
        if (url.pathname === '/api/health') return Response.json({ ok: true })

        if (url.pathname === '/api/todos' && request.method === 'GET') {
          return Response.json(db.query('SELECT * FROM todos ORDER BY id').all())
        }
        if (url.pathname === '/api/todos' && request.method === 'POST') {
          const body = await request.json().catch(() => null)
          const title = typeof body?.title === 'string' ? body.title.trim() : ''
          if (!title) return Response.json({ error: 'title is required' }, { status: 400 })
          const todo = db.query('INSERT INTO todos (title) VALUES (?) RETURNING *').get(title)
          return Response.json(todo, { status: 201 })
        }
        return Response.json({ error: 'Not found' }, { status: 404 })
      },
    }

    -- _migrations/0001_create_todos.sql
    CREATE TABLE todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

The front end calls the backend with relative URLs: fetch('/api/todos'). A full runnable example lives at https://github.com/nearbycoder/yeeet.dev/tree/main/examples/todo-backend

### Migrations and the migration strategy

- Name files NNNN_description.sql: a number, an underscore, a name, and .sql. They run in numeric order (2 before 10). Zero-pad for readability: 0001_, 0002_.
- Each pending migration runs once, inside its own transaction, and is recorded with a SHA-256 checksum in the _yeeet_migrations table. Do not create, modify, or drop tables that start with _yeeet.
- Do not write BEGIN, COMMIT, or ROLLBACK in a migration; Yeeet wraps each file in a transaction. PRAGMA foreign_keys cannot change inside a transaction.
- Applied migrations are immutable. Editing one fails the next deploy with migration_changed. Never rename an applied file: the new name is treated as a new migration. Fix mistakes with a new migration.
- Migrations are forward-only. Rolling back a release does not undo schema changes, so every migration must keep the previous release working: add tables, add columns with defaults, add indexes, and backfill data. Remove or rename columns in two releases: first ship code that no longer uses the old column, then drop it in a later migration. For SQLite table rewrites, create a new table, copy rows, drop the old table, and rename the new one in one migration.
- Data migrations are ordinary SQL (INSERT ... SELECT, UPDATE). Keep each one fast; very large rewrites delay the first request after a deploy.

What happens on deploy:

1. The CLI uploads the files. Before any URL changes, Yeeet copies the target database (live, or the channel's database), applies the new migrations to the copy, and boots the new backend against it.
2. If a migration fails, an applied migration was edited, or the backend crashes while starting, the deploy fails with migration_failed, migration_changed, or backend_start_failed. The live release and its data are unchanged. Rehearsal imports your module, so avoid network calls and other side effects at module load time; perform work inside fetch.
3. Otherwise the URL moves to the new release. On the first backend request, Yeeet snapshots the real database into a backup, applies the pending migrations, and starts the new code.

Recovering data: yeeet backend status <site> lists backups (taken before every migration and before every restore). To undo a bad data change, roll back first so the old code is live, then restore the backup taken before the migration:

    yeeet rollback comet <previous-version>
    yeeet backend status comet
    yeeet backend restore comet <backup-file>.sqlite --yes

Restoring also saves the current data as a new backup, so a restore can itself be undone.

### Databases per hostname

- https://<site>.<domain>/api and custom domains use the live database. Rolling back or promoting a version keeps the same live data.
- https://<site>--<channel>.<domain>/api uses a separate database per channel, so staging data never touches production.
- Immutable version URLs (https://v-<id>.<domain>/api) each use their own empty, isolated database. Use them to test a release without touching real data.

### Test locally before deploying

Run these three checks every time you change backend code or migrations. They need Bun (curl -fsSL https://bun.sh/install | bash).

1. Unit-test the handler against an in-memory database. Put tests in _server/ so they deploy privately and can import the entry. Applying the real migrations keeps tests faithful to production:

   // _server/app.test.ts (run: bun test ./_server)
   import { Database } from 'bun:sqlite'
   import { expect, test } from 'bun:test'
   import { readdirSync, readFileSync } from 'node:fs'
   import { join } from 'node:path'
   import app from '../_server.ts'

   function testContext() {
   const db = new Database(':memory:')
   db.run('PRAGMA foreign_keys = ON')
   const dir = join(import.meta.dir, '..', '_migrations')
   const names = readdirSync(dir)
   .filter((name) => name.endsWith('.sql'))
   .sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b))
   for (const name of names) db.run(readFileSync(join(dir, name), 'utf8'))
   return { db, site: { slug: 'test', deploymentId: 'test', database: 'test' } }
   }

   const call = (ctx, path, init) => app.fetch(new Request('https://test.local' + path, init), ctx)

   test('creates and lists todos', async () => {
   const ctx = testContext()
   const created = await call(ctx, '/api/todos', { method: 'POST', body: JSON.stringify({ title: 'Ship it' }) })
   try {
   expect(created.status).toBe(201)
   expect(await (await call(ctx, '/api/todos')).json()).toHaveLength(1)
   } finally { ctx.db.close() }
   })

2. Rehearse exactly what the server will do. yeeet check applies every migration to a fresh database, boots the backend with the production harness, and reports layout errors:

   yeeet check ./my-site --json

   It exits 1 with errors such as migration_failed, invalid_migration_name, backend_entry_missing, or backend_start_failed.

3. Run the whole site locally and smoke-test it over HTTP. yeeet dev serves static files and /api with the production harness and migration engine. It does not emulate _headers, _redirects, password protection, or custom domains; verify those on a channel. Its database lives in .yeeet/dev/ and survives restarts; changes to _server.ts, _server/, or _migrations/ reload automatically.

   yeeet dev ./my-site --port 8787 &
   curl -s http://127.0.0.1:8787/api/health
   curl -s -X POST http://127.0.0.1:8787/api/todos -H 'content-type: application/json' -d '{"title":"Ship it"}'
   curl -s http://127.0.0.1:8787/api/todos
   kill %1

   Use yeeet dev --reset to rebuild the local database from migrations (for example after editing a migration that only ever ran locally). To test a new migration against existing data, run yeeet dev without --reset before and after adding it.

Then deploy and verify:

    yeeet deploy ./my-site --name comet --dry-run --json   # shows backend.entry and backend.migrations
    yeeet deploy ./my-site --name comet --json             # result.backend lists pending migrations
    curl -s https://comet.site.yeeet.dev/api/health
    yeeet backend logs comet                               # console output, errors, and migration messages
    yeeet backend status comet --json                      # databases, applied migrations, backups, workers

Ship risky changes to a channel first (yeeet deploy ./my-site --name comet --channel staging); the channel has its own database.

### Limits

- Requests: 10 MB body, 30 seconds to the first response byte. No websockets.
- Memory: about 256 MB per worker; a worker that exceeds it restarts on the next request.
- Source: _server.ts plus _server/ up to 200 files and 5 MB. Up to 500 migrations, 1 MB each.
- Idle workers stop after about 5 minutes. Cold starts include fetching source, migrations, and your top-level code.
- One worker per database at a time; SQLite serializes writes. This fits small and medium traffic, not high write throughput.
- No npm install: bare imports such as 'hono' fail. Bundle dependencies first: bun build src/server.ts --target=bun --outfile=dist/_server.js, then deploy dist.
- No environment variables or secrets yet; do not hardcode credentials in _server.ts.
- Logs are kept in memory on the runtime (the last few hundred lines per database).

### Errors you may see

- 400 backend_runtime_unavailable: this Yeeet instance has no backend runtime configured. Deploy static files only.
- 422 migration_failed / migration_changed / backend_start_failed on deploy: fix the migration or startup error; nothing went live.
- 500 backend_error from /api: your handler threw. Read yeeet backend logs <site>.
- 502 or 503 from /api: the backend failed to start or the runtime is restarting. Check yeeet backend logs <site>.
- 504 backend_timeout: the handler took longer than 30 seconds.

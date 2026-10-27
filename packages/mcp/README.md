# @yeeet.dev/mcp

Requires Node.js 20 or newer.

Official Model Context Protocol server for Yeeet. It gives coding agents typed
tools to plan and deploy local static builds, inspect sites and immutable
versions, roll back production, manage channels and domains, retrieve private
share links, inspect privacy-preserving aggregate analytics, and perform
explicitly confirmed cleanup.

```json
{
  "mcpServers": {
    "yeeet": {
      "command": "npx",
      "args": ["-y", "@yeeet.dev/mcp"],
      "env": {
        "YEEET_TOKEN": "yeeet_..."
      }
    }
  }
}
```

Create the API key in the Yeeet dashboard. Keep it in the MCP host's secret or
environment store—never in repository configuration. Set `YEEET_API` when
targeting a self-hosted control plane; it defaults to `https://yeeet.dev`.

For local repository development:

```sh
YEEET_TOKEN=yeeet_... node packages/mcp/bin/yeeet-mcp.js
```

The server uses stdio. Standard output is reserved for MCP JSON-RPC; operational
messages go to standard error. Destructive site and version tools require the
literal input `confirm: true`.

## Sites with backend state

`deploy_path` includes a root `_server.ts` or `_server.js`, private helper modules
under `_server/`, and numbered SQL migrations under `_migrations/`. The Bun
handler receives `(request, { db, site })` and returns a `Response`; all `/api`
requests run it. SQLite state survives worker shutdown and releases. Channels
and version URLs have separate databases.

Before `plan_deploy` and `deploy_path`, run `bun test ./my-site/_server` and
`yeeet check ./my-site --json` using local shell tools, then smoke-test HTTP with
`yeeet dev ./my-site`. The MCP server does not expose a local test runner.
Server-side deployment completion rehearses migrations and startup against a
copy of the target database before moving the URL. Keep migrations additive and
backward compatible because code rollback does not reverse schema changes.

Use `backend_status` with `{ "site": "my-site" }` to inspect routes, databases,
applied migrations, workers, and backups. Use `backend_logs` with the site and
optional `database` (`live`, `channel-staging`, or `version-<full-id>`) to debug
handler errors. Recovery is available through `yeeet backend restore`; no MCP
restore tool is exposed. Backend source and migrations are never public assets.

The [backend guide](https://github.com/nearbycoder/yeeet.dev/blob/main/docs/backend.md)
and the instance's `/llms-full.txt` include a complete handler, in-memory SQLite
tests, upgrade steps, recovery, and limits. Hosted backends require the runtime
service to be configured by the instance operator.

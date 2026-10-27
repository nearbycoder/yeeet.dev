# @yeeet.dev/cli

Deploy static assets with an optional Bun API and SQLite database to a
`*.site.yeeet.dev` URL.

Requires Node.js 22.12 or newer.

```sh
npm install --global @yeeet.dev/cli
yeeet login
yeeet deploy ./dist
```

Omit `--name` for a generated subdomain, or keep a stable site name across releases:

```sh
yeeet deploy ./dist --name my-site
yeeet versions my-site
yeeet rollback my-site <deployment-id>
```

Single-page app fallback is enabled by default, so refreshing a client-side route
serves `index.html`. Use `--static` for strict file-only routing.

Password protect a new deployment while still giving reviewers a one-click
link that needs no Yeeet account or password:

```sh
export YEEET_DEPLOY_PASSWORD='a long private password'
yeeet deploy ./dist --name my-site
yeeet share my-site
```

Access can be changed later, and share links can be revoked without uploading
the files again:

```sh
yeeet access protect my-site <version> --password 'a new password'
yeeet access rotate-link my-site <version>
yeeet access public my-site <version>
```

Remove one version or the complete site directly:

```sh
yeeet version remove my-site <version> --yes
yeeet remove my-site --yes
```

Custom domains can be managed without leaving the terminal:

```sh
yeeet domain add my-site www.example.com
yeeet domain list my-site
yeeet domain refresh my-site www.example.com
yeeet domain remove my-site www.example.com
```

Inspect cookie-free aggregate page views without collecting visitor identities:

```sh
yeeet analytics my-site --days 30
yeeet analytics my-site --days 7 --json
```

Analytics contain UTC daily totals, normalized top paths, and response status
classes. Yeeet does not store IP addresses, cookies, user agents, referrers, or
visitor IDs.

Run `yeeet --help` or `yeeet <command> --help` for the complete command reference.

## Self-hosted instances

The CLI defaults to `https://yeeet.dev`. Point it at another Yeeet control plane
with either form:

```sh
yeeet --api https://deploy.example.com login
YEEET_API=https://deploy.example.com yeeet deploy ./dist
```

The selected API URL is saved alongside the browser-login session. Automation
can combine `YEEET_API` with `YEEET_TOKEN` and `--json`.

Source, deployment documentation, and the MIT license are available in the
[Yeeet repository](https://github.com/nearbycoder/yeeet.dev).

## Check a build locally

```sh
yeeet check ./dist
yeeet check ./dist --strict --json
```

This offline check uses the same file discovery and `.yeeetignore` rules as
deploy. It reports counts, bytes, likely private files, missing entry pages,
source maps, and empty files without hashing, uploading, or requiring login.
Empty builds, private files, and standard count/size limit violations fail with
exit code 1; `--strict` also fails on warnings. Self-hosted users can set
`--max-bytes` to match their server. The server still validates every deployment.

## Bun backends and SQLite

Add `_server.ts` (or `_server.js`) to the folder you deploy. Export
`default { fetch(request, { db, site }) { return Response.json(...) } }` to
handle `/api` and `/api/*`; other paths remain static. `db` is a `bun:sqlite`
database that survives worker shutdown and releases. Put helper modules in
`_server/` and numbered SQL files in `_migrations/0001_name.sql`. All three paths
are private and never served as assets.

Install Bun for local tests, then run:

```sh
bun test ./my-site/_server
yeeet check ./my-site --json
yeeet dev ./my-site --port 8787
# In another terminal:
curl http://127.0.0.1:8787/api/health
yeeet deploy ./my-site --name my-site --dry-run --json
yeeet deploy ./my-site --name my-site --json
yeeet backend status my-site --json
yeeet backend logs my-site --database live
```

`check` applies migrations to a fresh database and boots the handler without
uploading or requiring login. Without Bun, it reports `backend_unchecked`;
`--strict` makes that warning fail. `dev` stores state in `.yeeet/dev/`, reloads
backend changes, and accepts `--reset` to rebuild the local database. It does
not emulate `_headers`, `_redirects`, password protection, or custom domains.

Deploys rehearse migrations against a copy of the target database before
activation. Applied migrations must not be edited or renamed. Add new files,
keep changes compatible with the previous code, and test them with existing
data: rollback moves code while preserving schema and data. Production and
custom domains share live data; channels and version URLs have separate data.

Recover a database using a backup listed by `backend status`:

```sh
yeeet rollback my-site <previous-version>
yeeet backend restore my-site <backup-file>.sqlite --database live --yes
```

Restore takes a safety backup first. Backend support requires the optional
runtime to be configured on the instance. Read the
[complete backend guide](https://github.com/nearbycoder/yeeet.dev/blob/main/docs/backend.md)
for handler tests, migration strategy, limits, and recovery details.

## Open a site or version

```sh
yeeet open my-site
yeeet open my-site 52eabb5f
yeeet open my-site --print
yeeet open my-site 52eabb5f --json
```

The default opens the live site in your browser. A full version ID or unique
prefix of at least eight characters opens its immutable URL. Non-ready versions
and ambiguous prefixes fail clearly. `--print` and `--json` never launch a
browser. URLs contain no private share token; password protection still applies.

## Search and page through versions

```sh
yeeet versions my-site --search "launch" --status ready
yeeet versions my-site --status failed --json
yeeet versions my-site --cursor '<nextCursor>' --status failed --json
```

Search matches version IDs, release labels, and notes. Each response is one
page. JSON preserves `nextCursor`; human output shows it when more results
exist. Pass that cursor with the same search and status to continue. Empty
results are successful; invalid filters and server errors return a nonzero exit.

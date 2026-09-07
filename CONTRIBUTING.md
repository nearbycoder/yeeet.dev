# Contributing to Yeeet

Thanks for helping Yeeet improve. Bug fixes, documentation, tests, accessibility
work, deployment-provider improvements, and focused features are welcome.

## Before opening a change

1. Search existing issues and pull requests.
2. Open an issue before a large architectural change so implementation work is
   not duplicated.
3. Use GitHub's private vulnerability-reporting flow for security issues; do not
   open a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Use Node.js `20.19+` or `22.12+`, PostgreSQL, and a private S3-compatible bucket.

```sh
cp .env.example .env.local
npm install
npm run db:migrate
npm run dev
```

Never put real credentials in fixtures, screenshots, documentation, commit
messages, or pull-request descriptions. Use neutral example domains and
`example.com` addresses.

## Pull requests

- Keep changes focused and explain the user impact.
- Add or update tests for behavior changes.
- Commit generated Drizzle migrations when the schema changes.
- Keep API behavior agent-friendly: stable JSON, useful errors, and predictable
  exit codes.
- Preserve keyboard access, mobile usability, and reduced-motion behavior.
- Run the complete local check before requesting review:

```sh
npm run check
npm run lint
npm run typecheck
npm test
npm run build
```

By contributing, you agree that your contribution is licensed under the
project's [MIT License](LICENSE).

For changes to copy or authentication feedback, start the app with an isolated
local database, install the `agent-browser` CLI, then run the optional browser
regressions against your dev server:

```sh
npm run test:browser -- http://localhost:3000
```

These checks simulate clipboard rejection and abort authentication requests;
they do not create accounts or sign in. CI runs database integration tests against a disposable PostgreSQL service.
To run them locally, point `DATABASE_URL` at an isolated database, apply
migrations with `npm run db:migrate`, then run `npm run test:integration`.
These tests create and clean up their own fixtures. Unit tests and the build
remain independent of a running database.

## Site mutation locking

Use `withSiteLock(siteId, ownerId, callback)` for transactions that change
retention eligibility or delete site/version metadata. Lock the parent site
before any version, channel, feedback, or retention-policy row, and re-read
targets after acquiring the lock. New-site creation uses `lockSite` within its
existing transaction. Do not replace this protocol with a child-row lock or a
process-local mutex: other app instances must coordinate too.

Keep object-store requests and webhook emission outside these transactions.
Metadata deletion and its durable storage-cleanup job must commit together.
PostgreSQL releases the [row lock](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
when the transaction ends; unrelated sites can proceed independently.
The integration suite exercises both orders of cleanup/reference races using
separate PostgreSQL connections and observable lock waits.

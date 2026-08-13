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

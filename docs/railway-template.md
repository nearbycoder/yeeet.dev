# Deploy and Host Yeeet with Railway

Yeeet is an open-source deployment plane for static sites. Give its web console,
CLI, CI job, or coding agent a file or built directory and it publishes an
atomic HTTPS deployment with a readable subdomain, immutable version history,
rollback, SPA routing, custom domains, and optional private sharing.

This template provisions the complete platform: the TanStack Start application,
PostgreSQL with persistent storage, and a private Railway Bucket. Railway
references connect the services without exposing credentials, and every new
deployment receives fresh authentication and database secrets.

## About Hosting Yeeet

The application is both the control plane and the static-asset gateway.
PostgreSQL stores users, sites, immutable versions, domains, invitations, and
active release pointers. The private bucket stores uploaded files. Requests for
live sites pass through Railway's edge to the gateway, which resolves the
correct version, enforces sharing rules, and returns cache and crawler headers.

The deploy form asks for four values specific to your installation:

- `SITE_DOMAIN`: the wildcard suffix you own, such as `site.example.com`;
- `DOCS_HOST`: the hostname for built-in docs, such as `docs.example.com`;
- `ADMIN_EMAILS`: one or more comma-separated bootstrap administrators;
- `INITIAL_INVITATION_CODE`: a private one-time code for the first signup.

Railway creates a generated HTTPS domain for the control plane. After the first
deploy, attach your control-plane, wildcard site, and docs domains to the Yeeet
service and add every DNS record Railway provides, including ownership and ACME
verification. Then configure bucket CORS for the control-plane origin so browser
uploads can use signed URLs.

## Common Use Cases

- Publish static builds from a terminal with `yeeet deploy ./dist`.
- Give coding agents and CI jobs deterministic JSON and API-key authentication.
- Create immutable previews, promote a version, or roll back instantly.
- Share password-protected work through revocable one-click links.
- Run an internal static-site platform with invitations and admin moderation.
- Host disposable documentation, demos, prototypes, and hackathon projects.

## Dependencies for Yeeet Hosting

- A Railway application service built from
  [nearbycoder/yeeet.dev](https://github.com/nearbycoder/yeeet.dev).
- Railway PostgreSQL and its persistent volume.
- A private Railway Bucket with S3-compatible credentials.
- A domain whose DNS you can edit for wildcard site and docs routing.
- Optional GitHub OAuth credentials for GitHub login.
- An optional project-scoped Railway token for end-user custom-domain
  provisioning. Wildcard deployments do not need it.

### Deployment Dependencies

- [Production setup and DNS checklist](https://github.com/nearbycoder/yeeet.dev/blob/main/docs/railway.md)
- [Environment variable reference](https://github.com/nearbycoder/yeeet.dev/blob/main/.env.example)
- [CLI documentation](https://docs.yeeet.dev)
- [Source, issues, and releases](https://github.com/nearbycoder/yeeet.dev)

### Implementation Details

The repository's `railway.json` runs committed Drizzle migrations and the admin
bootstrap before each release, starts the Nitro server, and checks `/health`.
Uploads use short-lived signed PUT URLs. A deployment becomes active only after
the complete manifest has been verified, so interrupted uploads never replace a
working release.

Public live aliases revalidate quickly, immutable version URLs can be cached for
a year, and private responses use `private, no-store`. Version previews and
private deployments emit crawler-blocking headers. SPA fallback is enabled by
default and can be disabled per deployment for strict static-file routing.

### Why Deploy Yeeet on Railway?

Railway keeps the application, database, persistent volume, private object
storage, generated HTTPS endpoint, deployment logs, health checks, and GitHub
autodeploys in one project. The result is a compact static-site platform that is
easy to operate, easy to fork, and straightforward for humans and agents to
understand.

Yeeet is MIT licensed. You may use, modify, distribute, and run it commercially.

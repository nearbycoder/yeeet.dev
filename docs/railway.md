# Railway production setup

This guide deploys a self-hosted Yeeet instance as one Railway application
service with Railway Postgres and a private Railway Bucket. The application is
both the TanStack control plane and wildcard asset gateway; Railway's edge sits
in front of the gateway.

The examples use these replaceable domains:

- Control plane: `https://deploy.example.com`
- Site wildcard: `*.site.example.com`
- Documentation: `https://docs.example.com`

## 1. Create the resources

Create these resources in the same Railway project and production environment:

1. An application service sourced from your fork of this repository.
2. A PostgreSQL service, for example `Postgres`.
3. A private Railway Bucket, for example `Assets`, near the app's region.

Do not make the bucket public. Yeeet deliberately delivers objects through the
gateway so it can resolve versions, authorize private shares, and set the right
cache and crawler headers.

[`railway.json`](../railway.json) instructs Railway to:

- build with Railpack using `npm run build`;
- run committed Drizzle migrations and bootstrap administrators before release;
- start the Nitro server with `npm run start`;
- check `/health` before considering a release healthy.

## 2. Configure the application

Set these variables on the application service. Railway reference names are
case-sensitive.

```text
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}

BETTER_AUTH_URL=https://deploy.example.com
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
SITE_DOMAIN=site.example.com
DOCS_HOST=docs.example.com

ADMIN_EMAILS=admin@example.com
INITIAL_INVITATION_CODE=<private one-time bootstrap code>

GITHUB_CLIENT_ID=<optional GitHub OAuth client ID>
GITHUB_CLIENT_SECRET=<optional GitHub OAuth client secret>
VITE_GITHUB_AUTH_ENABLED=false

S3_ENDPOINT=${{Assets.ENDPOINT}}
S3_BUCKET=${{Assets.BUCKET}}
S3_ACCESS_KEY_ID=${{Assets.ACCESS_KEY_ID}}
S3_SECRET_ACCESS_KEY=${{Assets.SECRET_ACCESS_KEY}}
S3_REGION=${{Assets.REGION}}
S3_FORCE_PATH_STYLE=false

MAX_DEPLOY_BYTES=524288000
DB_POOL_SIZE=10
```

Use `VITE_GITHUB_AUTH_ENABLED=true` only after both GitHub OAuth variables are
present. `ADMIN_EMAILS` is a comma-separated bootstrap allowlist. The
pre-deploy command promotes matching existing users on each release, while
Better Auth assigns the role when a matching account is created.

`INITIAL_INVITATION_CODE` seeds an idempotent first invitation. After the first
administrator signs in, create, rotate, and revoke invitations from `/admin`.
Never reuse a development invitation code in production.

### Optional custom-domain provisioning

To let users attach their own domains, create a project-scoped token in Railway
and add it to the app service:

```text
RAILWAY_TOKEN=<project-scoped token>
```

Railway automatically injects `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID`,
and `RAILWAY_SERVICE_ID`. An account token can be supplied as
`RAILWAY_API_TOKEN`, but it has broader authority and is not recommended.

Without a token, custom-domain actions are disabled while normal wildcard
deployments continue to work. Railway may enforce per-service custom-domain
quotas. The `*.site.example.com` wildcard is one service domain and does not
consume another Railway domain for every Yeeet site.

## 3. Configure GitHub OAuth (optional)

Create an OAuth app in GitHub with:

```text
Homepage URL: https://deploy.example.com
Authorization callback URL: https://deploy.example.com/api/auth/callback/github
```

The OAuth app needs read access to email addresses. Add the client ID and secret
to Railway, set `VITE_GITHUB_AUTH_ENABLED=true`, and redeploy because that flag
is included in the browser build.

Email/password authentication works without GitHub OAuth.

## 4. Configure bucket CORS

Browser uploads use short-lived signed bucket URLs. Configure the bucket to
accept upload requests from the control-plane origins:

```json
[
  {
    "AllowedOrigins": ["https://deploy.example.com", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "HEAD"],
    "AllowedHeaders": ["content-type", "x-amz-*"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

With the variables available locally, the included helper can apply this policy:

```sh
S3_CORS_ORIGINS=https://deploy.example.com,http://localhost:3000 \
  npm run bucket:cors
```

## 5. Add the platform domains

Add all three domains to the application service:

```text
deploy.example.com
*.site.example.com
docs.example.com
```

Railway returns the required DNS records. Add every record exactly as returned
at your DNS provider, including:

- the control-plane CNAME or apex target;
- the wildcard CNAME for `*.site`;
- the `_acme-challenge` CNAME used for wildcard certificate issuance;
- Railway's ownership-verification TXT record;
- the docs-host CNAME.

Do not infer Railway targets or omit verification records. Wildcard TLS will not
resolve until DNS ownership and ACME delegation are both valid. Railway then
issues and renews the certificates automatically.

## 6. Deploy and verify

Push the default branch or run a targeted Railway CLI deployment. Wait for the
deployment to reach `SUCCESS`; a queued build is not yet live.

Verify the control plane and documentation:

```sh
curl -fsS https://deploy.example.com/health
curl -I https://docs.example.com/
curl -fsS https://docs.example.com/llms.txt | head
```

Create a test site, then inspect the gateway response:

```sh
YEEET_API=https://deploy.example.com yeeet login
YEEET_API=https://deploy.example.com yeeet deploy ./dist --name smoke-test
curl -I https://smoke-test.site.example.com/
```

Look for `etag`, `cache-control`, `x-yeeet-deployment`, and the expected content
type. Test a client-side SPA route and a missing asset separately.

## 7. Caching and operational notes

- Live aliases revalidate quickly so overwrites, rollbacks, and moderation
  deletions propagate.
- Immutable version hosts use long-lived caching and never change.
- Protected versions use `private, no-store` and crawler-blocking headers.
- Version preview hosts are always marked `noindex`.
- Database migrations are committed under [`drizzle/`](../drizzle).
- Back up Postgres and the object bucket together; the database contains the
  object manifest and active-version pointers.

Treat the following as production secrets: auth secret, invitation codes,
database URLs, OAuth client secret, bucket keys, Railway tokens, Yeeet API keys,
deployment passwords, and private share URLs.

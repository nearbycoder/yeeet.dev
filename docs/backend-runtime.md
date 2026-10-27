# Operate the Bun backend runtime

The optional runtime runs separately from the Node control plane. The gateway
forwards `/api` requests using a short-lived HMAC-signed context. The runtime
fetches only the deployment's private backend bundle, starts a Bun child process
on demand, and stores SQLite databases and backups on its persistent volume.
Workers stop after five idle minutes. Static hosting works without this service.

See [the authoring guide](backend.md) for `_server.ts`, migrations, and local
testing, and [the todo example](../examples/todo-backend) for a working app.

## Deployment

1. Apply the control-plane Drizzle migrations, including
   `0019_deployment_backend.sql`, using the existing migration command. This adds
   nullable backend metadata; existing deployments remain static.
2. Create a runtime service from this repository with the repository root as its
   build context. Configure the service's builder as `DOCKERFILE`, Dockerfile
   path as `packages/runtime/Dockerfile`, start command as `bun src/server.js`,
   and health check as `/health`. Leave its pre-deploy command empty. Railway
   no longer accepts legacy `railway.json` config paths for new services; set
   these service settings directly or manage them through Railway IaC. The
   existing Node app keeps its own build and migration commands.
3. Mount a persistent volume at `/data`. Run exactly **one runtime replica** per
   volume and instance; worker ownership and migration locks are process-local.
   Do not autoscale replicas or mount the same database in multiple runtimes.
4. Set the variables below. Generate a random shared secret of at least 32
   characters and supply it securely to both services. Keep the runtime on the
   private network; it needs no public domain or bucket/Postgres credentials.
5. Deploy the runtime, then set the app's runtime variables and deploy the app.
   The runtime must be able to reach the app to fetch bundles, and the app must
   be able to reach the runtime. Use their actual private service names/ports.

App service (replace the hostname and secret):

```text
BACKEND_RUNTIME_URL=http://runtime.railway.internal:8080
BACKEND_RUNTIME_SECRET=<shared-random-secret>
```

Runtime service:

```text
PORT=8080
HOST=::
DATA_DIR=/data
CONTROL_PLANE_URL=http://yeeet.railway.internal:8080
BACKEND_RUNTIME_SECRET=<same-shared-random-secret>
RUNTIME_ISOLATION=required
```

For another container host, build from the repository root:

```sh
docker build -f packages/runtime/Dockerfile -t yeeet-runtime .
```

Run that image with the variables above, a private network, and `/data` mounted.
The image starts as root; it drops each site's worker to a distinct persistent
UID/GID. `required` is the default and refuses startup without root and working
`CAP_SETUID`/`CAP_SETGID`. `auto` permits a fallback, and `off` explicitly disables
user separation; use `off` only for local tests with trusted code.

## Isolation and limits

This runtime is for **trusted deployment authors**. Different sites have separate
OS users and private directories; workers receive no platform secrets. Backups
and bundle files are owned by the supervisor. This is not a container or VM
sandbox for hostile code: workers can execute programs, access the container's
network, and read world-readable files. Channel and version databases separate
normal application data, but code from the same site runs as the same OS user
and can access that site's other databases. Rehearsal code has the same access.
Do not enable it for arbitrary untrusted tenants without stronger process,
filesystem, network, and resource isolation. Keep runtime-network access scoped
and never inject unrelated credentials into this container.

| Runtime variable             | Default            | Meaning                                                          |
| ---------------------------- | ------------------ | ---------------------------------------------------------------- |
| `RUNTIME_IDLE_TIMEOUT_MS`    | `300000`           | Stop idle workers after this interval                            |
| `RUNTIME_MAX_WORKERS`        | `32`               | Evict idle workers above this target; not a hard concurrency cap |
| `RUNTIME_MAX_MEMORY_MB`      | `256`              | Linux worker RSS restart threshold, sampled every five seconds   |
| `RUNTIME_REQUEST_TIMEOUT_MS` | `30000`            | Time to response headers; a timeout kills the worker             |
| `RUNTIME_START_TIMEOUT_MS`   | `10000`            | Worker startup deadline                                          |
| `RUNTIME_BACKUPS_KEEP`       | `10`               | Retained backups per database                                    |
| `RUNTIME_BUN_PATH`           | Current executable | Bun executable for workers                                       |

The gateway also has a 45-second upstream header deadline. A cold start and
migrations count toward that deadline. Bodies are limited to 10 MB; response
bodies may stream after headers arrive. There are no hard disk quotas, aggregate
CPU limits, background-job guarantees, or per-handler secret settings yet.

## Verify the rollout

```sh
curl -fsS http://runtime.railway.internal:8080/health
bun test ./examples/todo-backend/_server
node packages/cli/bin/yeeet.js check examples/todo-backend --json
node packages/cli/bin/yeeet.js deploy examples/todo-backend --name backend-smoke
```

With the CLI authenticated against this instance, POST a todo, GET it, and check
`yeeet backend status backend-smoke --json` and `yeeet backend logs backend-smoke`.
Restart the runtime and confirm the todo is still present. Verify a staging
channel starts empty and cannot change live data. A deployment containing a
broken migration must fail before changing the live pointer. The automated
`npm run test:integration` suite exercises the control plane, gateway, Bun,
SQLite, and a local S3 stand-in; it requires Bun and a migrated test Postgres DB.

## Data and recovery

`/data/sites/<site-id>/db/` contains live, channel, and version databases.
`/data/backups/` holds pre-migration and pre-restore snapshots.
`/data/runtime.sqlite` maps sites to stable OS users: preserve it with the data.
`/data/bundles/` caches private deployment source and is fetched again on demand.

Back up the persistent volume independently of Postgres and object storage.
For filesystem copies, stop the runtime first or use SQLite-aware snapshots;
copying only an active `.sqlite` file can omit writes in its WAL file. Snapshots
on the same volume protect migration recovery, not volume loss. Monitor volume
usage and runtime logs. Worker logs returned by the CLI are held in memory.

Migrations are forward-only. Rehearsal checks a snapshot, then the real database
is backed up and migrated on the first request. Keep changes compatible with the
previous code and test upgrades with existing data. See the authoring guide for
code rollback and `yeeet backend restore` recovery. Top-level application code
runs during rehearsal; put side effects in request handlers.

Removing a backend from a deployment preserves its live data for a later
backend release. Removing a channel alias preserves its database. Removing a
version deletes its version database; removing a site deletes all its runtime
databases and backups. Cached source bundles expire after seven days without
use. Storage cleanup also asks the runtime to purge data. If the runtime is
unavailable, inspect its volume for orphaned data after recovery; purge failures
are logged and do not prevent object cleanup.

To disable new backend deployments, unset the app's runtime variables. Existing
static releases continue working; existing backend routes return unavailable.
Keep the volume until data has been backed up or deliberately removed. No
production infrastructure is created by applying these source changes.

# Working in the Yeeet console

## Deploy and review

Use **Deploy an update** from a site's overview to prefill its destination. Select
a folder or files, then **Review deployment** to inspect added, changed, removed,
and reused files before uploading. Changing the files or deployment options
requires a fresh review. A channel deployment updates that channel without moving
production.

**Inspect** lists a deployment's file paths, sizes, checksums, headers, redirects,
and routing settings. Choose another version as the comparison baseline.
**Versions** previews the changes before making a previous version live.

Browser uploads hash files in a Web Worker, retry each missing file up to three
times, and support pausing. An account-scoped recovery record stays in this browser
for seven days. After a reload, restore the destination settings, reselect the
original files, review, and resume. Successfully stored files are skipped and
upload links are refreshed. Private builds require the same password again;
passwords and file contents are never stored in recovery metadata. Forget the
saved attempt to deploy a different build. If browser storage is unavailable,
recovery works only while the current page remains open.

## Channels and sharing

**Channels** creates, reassigns, removes, and promotes named aliases such as
`staging`. **Sharing** distinguishes the production URL, immutable version URLs,
and private share links. You can change the password, rotate a link, or restore
public access. Rotation invalidates previous private share links for new requests;
already downloaded or cached public files cannot be recalled.

## Organize sites

In a site's overview, set a favorite, project group, and up to 12 tags. These are
personal settings stored with your account. Dashboard search includes site names,
domains, groups, and tags; combine it with status, group, and favorite filters.

## API keys and webhooks

Open **Integrations** to create named API keys, choose an expiry, rename, disable,
extend, or revoke them. New keys appear once. Key lists show safe metadata and the
request count in the current rate window, not an all-time usage total.

Webhooks support event selection, endpoint editing, pause/resume, signing-secret
rotation, and the latest 50 deliveries. Failed deliveries can be queued again
when their endpoint is active. Successful or pending deliveries cannot be manually
replayed. Programmatic retry is `POST /api/v1/webhooks/deliveries/{deliveryId}/retry`.

## Team workspaces and version feedback

Open **Workspaces**, create a workspace, and assign sites you own. A site can
belong to one workspace at a time. Add an existing, active Yeeet account by email;
this grants access immediately and does not send an email invitation.

| Role   | Access                                                                     |
| ------ | -------------------------------------------------------------------------- |
| Owner  | Membership, site assignments, workspace settings, deployment and review    |
| Editor | Review, comment, deploy assigned sites, promote versions, resolve feedback |
| Viewer | Review versions and add feedback                                           |

Team review takes place in the Workspaces screen. Personal API keys, webhook
settings, and unrelated sites stay with their owner. Editors can use the normal
deployment endpoints for assigned site names; upload completion rechecks current
membership. Removing a member prevents further workspace access, but copied
private share links should be rotated separately if access must be recalled.

Feedback belongs to a specific version and page path. Editors can resolve or
reopen comments; authors and workspace owners can delete them. The latest 100
comments for the selected version are displayed. Deleting a workspace removes its
membership and feedback, while preserving the owner's sites and versions.

## Preview expiry and health

The site owner manages **Lifecycle**. Preview expiry applies to the immutable
version URL and every channel pointing to that version. Expired previews return
HTTP 410 from the gateway. Extend the expiry or choose **Never / restore access**
to restore access. Production never expires; promoting a preview clears its
expiry. Expiry does not delete stored files. Previously cached or downloaded
copies cannot be recalled; expiring responses use `no-store` on new requests.

Health checks exercise a chosen path on the production build through the origin
serving code, including private builds. They report the HTTP status, response time,
version, and last check. They do not test public DNS or CDN reachability. Save an
expected status and run a check manually, or enable checks approximately every
15 minutes. Scheduled checks require a running application process.

## Cleanup and retention

**Cleanup** previews eligible versions and their storage size. Set the minimum
age and number of completed versions to keep, review the exact list, then confirm
its deletion. If references or eligibility change, a fresh preview is required.

Cleanup always preserves production, channel targets (even expired ones), uploads
in progress, and versions with unresolved feedback. It examines the latest 2,000
versions and removes at most 50 per run. Remove unused channels or resolve feedback
when their versions no longer need protection. Deleted versions and their resolved
feedback cannot be restored.

Automatic retention is off by default. Enabling it schedules the first run for
24 hours later and applies the same rules daily while the application is running.
Each run rechecks the saved policy and current references. Saving a changed policy
reschedules its next run. The screen shows the last result and any error.

Version records are removed in a short metadata transaction. Stored files are
removed afterward by durable background jobs, with retries if storage is
unavailable. Pending jobs survive restarts; refresh Cleanup to see progress.

## Self-hosted upgrades

Apply the committed Drizzle migrations before starting the updated application.
No new third-party service is required. Health, retention, and storage-cleanup
workers run in the application and claim due database work across replicas.
Cleanup briefly serializes deployment metadata writes while it rechecks references
and removes a bounded batch; it does not hold these locks during storage requests.

## Search and history pages

The fleet searches sites, domains, project groups, and tags on the server and
returns 20 sites per page. Filters and continuation cursors live in the URL,
so reload, bookmarks, and browser Back preserve your place. Search explicitly
with the Search button; changing filters returns to the first page.

Version history and workspace feedback return 25 entries per page with links
to older entries. Version search accepts an ID, channel, or source; feedback
search accepts comment text or page paths and can show open or resolved items.
Old versions can still be inspected, shared, promoted, protected, and deleted
by ID even when outside the latest 100 versions.

`GET /api/v1/sites/:slug/versions` keeps its default 100-entry response and
adds `nextCursor`. Pass that value as `cursor` to continue, and optionally
pass `q` and `status=ready|uploading|failed`. Keep the same filters while
following a cursor. Results sort by creation time and ID, newest first;
new versions appear when you return to the first page. A cursor from another
account or filter combination is rejected.

Cleanup coordinates with other changes to the same site, while other sites
remain writable. A promotion, channel assignment, or new/reopened feedback
that wins the race protects its version; a stale manual cleanup plan asks you
to preview again. If cleanup wins first, waiting actions report that the
version is unavailable.

Manual site/version deletion removes metadata and queues object cleanup in
one transaction. The API additionally returns `cleanupPending: true` if the
immediate object-store attempt fails; the worker retries the durable job.
Deleted versions stay unavailable during retries. Keep the app running to
process queued object cleanup.

## File explorer

In Inspect, combine path search with a file-type family and path/size sorting.
Counts and byte totals describe every matching file; the table renders 100 rows
at a time. Previous/Next file controls keep large manifests usable. Filters reset
when you choose another version. Clear file filters restores a no-results view.

## Manifest downloads

Inspect can download the complete selected version's manifest as JSON or CSV,
regardless of file-explorer filters. Exports include site/version identity, paths,
byte sizes, content types and recorded checksums. They exclude storage keys,
passwords and private share tokens. CSV cells escape formulas and multiline paths.

## Comparison reports

After choosing a comparison baseline in Inspect, download Markdown for a review
or JSON for tooling. Reports identify both versions, list all four change classes,
include byte totals and mark routing/header/redirect changes. Paths are escaped
in Markdown; no storage credentials or share tokens are exported.

## Asset budgets

Open Asset budget review in Inspect to set per-file KiB and total MiB thresholds.
The report shows over-budget counts, the exact total overage, bytes by type and
the ten largest files. It measures stored uncompressed bytes, not network transfer
or load time. Budgets are temporary review settings; Reset budgets restores
512 KiB per file and 10 MiB total. They never block a deployment.

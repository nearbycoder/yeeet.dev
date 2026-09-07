import { useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { workspaceSearchSchema } from '#/lib/pagination'
import { SitePicker } from '#/components/site-picker'
import { DashboardHeader } from '#/components/dashboard-header'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { ManifestDiff } from '#/components/manifest-diff'
import { useConsoleMutation } from '#/lib/console-request'
import { canEditWorkspace } from '#/lib/workspaces'
import {
  getSession,
  getWorkspaceConsole,
  updateWorkspace,
} from '#/server/functions'

export const Route = createFileRoute('/dashboard_/workspaces')({
  validateSearch: workspaceSearchSchema,
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({
        to: '/login',
        search: { redirect: '/dashboard/workspaces' },
      })
    return { user: session.user }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getWorkspaceConsole({ data: deps }),
  component: Workspaces,
})
function Workspaces() {
  const data = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const search = Route.useSearch()
  const selected = data.selected
  const mutation = useConsoleMutation()
  const [confirm, setConfirm] = useState<{
    title: string
    description: string
    action: unknown
  } | null>(null)
  const [body, setBody] = useState('')
  const [path, setPath] = useState('/')
  const editor = selected && canEditWorkspace(selected.role)
  const owner = selected?.role === 'owner'
  const navigate = (next: typeof search) =>
    void router.navigate({
      to: '/dashboard/workspaces',
      search: next,
      resetScroll: false,
    })
  const act = (action: unknown) =>
    mutation.run(() => updateWorkspace({ data: action }))
  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />
      <main id="main-content" tabIndex={-1} className="dashboard-main">
        <div className="dashboard-intro">
          <div>
            <h1>Team workspaces</h1>
            <p>
              Share selected sites, review versions, and keep feedback with the
              build.
            </p>
          </div>
        </div>
        {mutation.error ? (
          <p role="alert" className="form-error">
            {mutation.error}
          </p>
        ) : null}
        {mutation.notice ? (
          <p role="status" className="form-success">
            {mutation.notice}
          </p>
        ) : null}
        <div className="site-page-stack">
          <section className="panel site-page-panel">
            <h2>Your workspaces</h2>
            <div className="console-form-grid">
              <label>
                Workspace
                <select
                  value={selected?.id ?? ''}
                  onChange={(event) =>
                    navigate({ workspace: event.target.value || undefined })
                  }
                >
                  <option value="">Choose a workspace</option>
                  {data.workspaces.map((workspace) => (
                    <option value={workspace.id} key={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="console-form-grid"
                onSubmit={(event) => {
                  event.preventDefault()
                  const form = new FormData(event.currentTarget)
                  void mutation.run(async () => {
                    const result = await updateWorkspace({
                      data: {
                        action: 'create',
                        name: String(form.get('name')),
                      },
                    })
                    navigate({ workspace: result.id })
                  })
                }}
              >
                <label>
                  New workspace name
                  <input
                    name="name"
                    required
                    maxLength={80}
                    placeholder="Launch team…"
                  />
                </label>
                <button className="button button-ink" disabled={mutation.busy}>
                  Create workspace
                </button>
              </form>
            </div>
          </section>
          {selected ? (
            <>
              <section className="panel site-page-panel">
                <h2>
                  {selected.name}{' '}
                  <span className="state-pill">{selected.role}</span>
                </h2>
                <p>
                  Viewers can review and comment. Editors can also deploy
                  updates, promote versions, and resolve feedback. Owners manage
                  membership and site access.
                </p>
                {owner ? (
                  <>
                    <form
                      key={selected.id}
                      className="console-form-grid"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void act({
                          action: 'rename',
                          workspace: selected.id,
                          name: String(
                            new FormData(event.currentTarget).get('name'),
                          ),
                        })
                      }}
                    >
                      <label>
                        Workspace name
                        <input
                          name="name"
                          required
                          maxLength={80}
                          defaultValue={selected.name}
                        />
                      </label>
                      <button
                        className="button button-paper"
                        disabled={mutation.busy}
                      >
                        Rename workspace
                      </button>
                    </form>
                    <form
                      className="console-form-grid"
                      onSubmit={(event) => {
                        event.preventDefault()
                        const form = new FormData(event.currentTarget)
                        void act({
                          action: 'member',
                          workspace: selected.id,
                          email: String(form.get('email')),
                          role: String(form.get('role')),
                        })
                      }}
                    >
                      <label>
                        Member email
                        <input
                          name="email"
                          type="email"
                          required
                          placeholder="teammate@example.com"
                        />
                        <small>
                          Existing Yeeet accounts. Adding an existing member
                          updates their role.
                        </small>
                      </label>
                      <label>
                        Role
                        <select name="role">
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                      </label>
                      <button
                        className="button button-ink"
                        disabled={mutation.busy}
                      >
                        Save member
                      </button>
                    </form>
                  </>
                ) : null}
                {selected.members.map((member) => (
                  <article className="console-item" key={member.userId}>
                    <b>{member.name}</b>
                    <p>
                      {member.email} · {member.role}
                    </p>
                    {owner ? (
                      <button
                        className="button danger-link"
                        disabled={mutation.busy}
                        onClick={() =>
                          setConfirm({
                            title: `Remove ${member.name}?`,
                            description:
                              'They will lose workspace access immediately. Existing downloaded files or copied share links cannot be recalled; rotate private links in the sharing center if needed.',
                            action: {
                              action: 'remove-member',
                              workspace: selected.id,
                              userId: member.userId,
                            },
                          })
                        }
                      >
                        Remove member
                      </button>
                    ) : null}
                  </article>
                ))}
                {!selected.members.length ? (
                  <p>No additional members yet.</p>
                ) : null}
                {owner ? (
                  <button
                    className="button danger-link"
                    disabled={mutation.busy}
                    onClick={() =>
                      setConfirm({
                        title: 'Delete workspace?',
                        description:
                          'Members and feedback will be removed. Your sites and deployment versions remain in your personal dashboard.',
                        action: { action: 'delete', workspace: selected.id },
                      })
                    }
                  >
                    Delete workspace
                  </button>
                ) : null}
              </section>
              <section className="panel site-page-panel">
                <h2>Shared sites</h2>
                {owner ? (
                  <form
                    className="console-form-grid"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void act({
                        action: 'site',
                        workspace: selected.id,
                        slug: String(
                          new FormData(event.currentTarget).get('slug'),
                        ),
                        remove: false,
                      })
                    }}
                  >
                    <SitePicker />
                    <button
                      className="button button-ink"
                      disabled={mutation.busy}
                    >
                      Share site with workspace
                    </button>
                  </form>
                ) : null}
                <div className="console-actions">
                  {selected.sites.map((site) => (
                    <Link
                      key={site.id}
                      to="/dashboard/workspaces"
                      search={{ workspace: selected.id, site: site.slug }}
                      aria-current={
                        selected.history?.site.slug === site.slug
                          ? 'page'
                          : undefined
                      }
                    >
                      {site.slug}
                    </Link>
                  ))}
                </div>
                {!selected.sites.length ? <p>No sites assigned yet.</p> : null}
                {selected.history ? (
                  <div className="console-item">
                    <h3>{selected.history.site.slug}</h3>
                    <div className="console-actions">
                      {editor ? (
                        <Link
                          className="button button-coral"
                          to="/dashboard"
                          search={{
                            site: selected.history.site.slug,
                            channel: 'review',
                          }}
                        >
                          Deploy review update ↗
                        </Link>
                      ) : null}
                      {owner ? (
                        <button
                          className="button danger-link"
                          disabled={mutation.busy}
                          onClick={() =>
                            setConfirm({
                              title: 'Remove site from workspace?',
                              description:
                                'Workspace members will lose access to this site. The site and its versions remain in your account.',
                              action: {
                                action: 'site',
                                workspace: selected.id,
                                slug: selected.history!.site.slug,
                                remove: true,
                              },
                            })
                          }
                        >
                          Remove site
                        </button>
                      ) : null}
                    </div>
                    <label className="console-field">
                      Review version
                      <select
                        value={selected.version?.id ?? ''}
                        onChange={(event) => {
                          setBody('')
                          navigate({
                            workspace: selected.id,
                            site: selected.history!.site.slug,
                            version: event.target.value,
                          })
                        }}
                      >
                        {selected.version &&
                        !selected.history.versions.some(
                          (v) => v.id === selected.version?.id,
                        ) ? (
                          <option value={selected.version.id}>
                            {selected.version.id.slice(0, 8)} · Selected
                          </option>
                        ) : null}
                        {selected.history.versions.map((version) => (
                          <option key={version.id} value={version.id}>
                            {version.id.slice(0, 8)} ·{' '}
                            {version.current ? 'Live' : version.status} ·{' '}
                            {new Date(version.createdAt).toLocaleString()}
                          </option>
                        ))}
                      </select>
                    </label>
                    <nav
                      className="console-actions"
                      aria-label="Workspace version pages"
                    >
                      {search.versionCursor ? (
                        <button
                          className="button button-paper"
                          onClick={() =>
                            navigate({
                              ...search,
                              version: undefined,
                              versionCursor: undefined,
                              feedbackCursor: undefined,
                            })
                          }
                        >
                          Newest versions
                        </button>
                      ) : null}
                      {selected.history.nextCursor ? (
                        <button
                          className="button button-paper"
                          onClick={() =>
                            navigate({
                              ...search,
                              version: undefined,
                              versionCursor:
                                selected.history!.nextCursor ?? undefined,
                              feedbackCursor: undefined,
                            })
                          }
                        >
                          Older versions
                        </button>
                      ) : null}
                    </nav>
                    {selected.version ? (
                      <>
                        <div className="console-actions">
                          <a
                            href={
                              selected.version.shareUrl ??
                              selected.version.previewUrl ??
                              undefined
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open this version ↗
                          </a>
                          {editor &&
                          selected.version.status === 'ready' &&
                          !selected.version.current ? (
                            <button
                              className="button button-ink"
                              disabled={mutation.busy}
                              onClick={() =>
                                setConfirm({
                                  title: 'Make this version live?',
                                  description:
                                    'Production will point to this version. Review its differences below before confirming.',
                                  action: {
                                    action: 'promote',
                                    workspace: selected.id,
                                    slug: selected.history!.site.slug,
                                    version: selected.version!.id,
                                  },
                                })
                              }
                            >
                              Promote version
                            </button>
                          ) : null}
                        </div>
                        {selected.comparison ? (
                          <ManifestDiff diff={selected.comparison} />
                        ) : null}
                        <h3>Version feedback</h3>
                        <p role="status">
                          Showing {selected.comments.length} comments for{' '}
                          {selected.version.id.slice(0, 8)}, newest first.
                        </p>
                        <form
                          className="site-filters"
                          key={JSON.stringify([
                            search.feedbackQuery,
                            search.feedbackStatus,
                          ])}
                          onSubmit={(event) => {
                            event.preventDefault()
                            const fields = new FormData(event.currentTarget)
                            navigate({
                              ...search,
                              version: selected.version!.id,
                              feedbackCursor: undefined,
                              feedbackQuery:
                                String(fields.get('q') || '') || undefined,
                              feedbackStatus: String(
                                fields.get('status'),
                              ) as typeof search.feedbackStatus,
                            })
                          }}
                        >
                          <label>
                            Search feedback
                            <input
                              type="search"
                              name="q"
                              maxLength={200}
                              defaultValue={search.feedbackQuery}
                              placeholder="Comment or page path…"
                            />
                          </label>
                          <label>
                            Feedback status
                            <select
                              name="status"
                              defaultValue={search.feedbackStatus ?? 'all'}
                            >
                              <option value="all">All feedback</option>
                              <option value="open">Open</option>
                              <option value="resolved">Resolved</option>
                            </select>
                          </label>
                          <button className="button button-paper">
                            Search feedback
                          </button>
                        </form>
                        <nav
                          className="console-actions"
                          aria-label="Feedback pages"
                        >
                          {search.feedbackCursor ? (
                            <button
                              className="button button-paper"
                              onClick={() =>
                                navigate({
                                  ...search,
                                  version: selected.version!.id,
                                  feedbackCursor: undefined,
                                })
                              }
                            >
                              Newest feedback
                            </button>
                          ) : null}
                          {selected.feedbackNextCursor ? (
                            <button
                              className="button button-paper"
                              onClick={() =>
                                navigate({
                                  ...search,
                                  version: selected.version!.id,
                                  feedbackCursor:
                                    selected.feedbackNextCursor ?? undefined,
                                })
                              }
                            >
                              Older feedback
                            </button>
                          ) : null}
                        </nav>
                        <form
                          className="site-page-stack"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void mutation.run(async () => {
                              await updateWorkspace({
                                data: {
                                  action: 'comment',
                                  workspace: selected.id,
                                  slug: selected.history!.site.slug,
                                  version: selected.version!.id,
                                  body,
                                  path,
                                },
                              })
                              setBody('')
                            })
                          }}
                        >
                          <label className="console-field">
                            Page path
                            <input
                              value={path}
                              onChange={(event) => setPath(event.target.value)}
                              required
                              maxLength={500}
                              placeholder="/pricing"
                            />
                          </label>
                          <label className="console-field">
                            Feedback
                            <textarea
                              value={body}
                              onChange={(event) => setBody(event.target.value)}
                              required
                              maxLength={4000}
                              rows={3}
                              placeholder="What should change in this build?"
                            />
                          </label>
                          <button
                            className="button button-paper"
                            disabled={mutation.busy}
                          >
                            Add feedback
                          </button>
                        </form>
                        {selected.comments.map((comment) => (
                          <article className="console-item" key={comment.id}>
                            <b>
                              {comment.author ?? 'Former member'} ·{' '}
                              {comment.resolved ? 'Resolved' : 'Open'}
                            </b>
                            <small>
                              {' '}
                              · {new Date(
                                comment.createdAt,
                              ).toLocaleString()} · {comment.path}
                            </small>
                            <p className="feedback-body">{comment.body}</p>
                            <div className="console-actions">
                              {editor ? (
                                <button
                                  className="button button-paper"
                                  disabled={mutation.busy}
                                  onClick={() =>
                                    void act({
                                      action: 'resolve',
                                      workspace: selected.id,
                                      feedbackId: comment.id,
                                      resolved: !comment.resolved,
                                    })
                                  }
                                >
                                  {comment.resolved
                                    ? 'Reopen feedback'
                                    : 'Resolve feedback'}
                                </button>
                              ) : null}
                              {owner || comment.authorId === data.userId ? (
                                <button
                                  className="button danger-link"
                                  disabled={mutation.busy}
                                  onClick={() =>
                                    setConfirm({
                                      title: 'Delete feedback?',
                                      description:
                                        'This comment will be permanently removed.',
                                      action: {
                                        action: 'delete-comment',
                                        workspace: selected.id,
                                        feedbackId: comment.id,
                                      },
                                    })
                                  }
                                >
                                  Delete feedback
                                </button>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </>
                    ) : (
                      <p>No versions to review yet.</p>
                    )}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </main>
      <ConfirmDialog
        busyLabel="Working…"
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        busy={mutation.busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          void mutation.run(async () => {
            if (!confirm) return
            const action = confirm.action as { action: string }
            await updateWorkspace({ data: action })
            setConfirm(null)
            if (action.action === 'delete') navigate({})
            if (action.action === 'site') navigate({ workspace: selected?.id })
          })
        }
      />
    </div>
  )
}

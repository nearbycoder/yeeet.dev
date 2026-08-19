import { useRef, useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { ConfirmDialog } from '#/components/confirm-dialog'
import { DashboardHeader } from '#/components/dashboard-header'
import { Yeeetling, getYeeetlingDesign } from '#/components/yeeetling'
import type { YeeetlingPhase } from '#/components/yeeetling'
import { authClient } from '#/lib/auth-client'
import { getDashboardData, getSession } from '#/server/functions'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: '/login', search: { redirect: '/dashboard' } })
    return { user: session.user }
  },
  loader: () => getDashboardData(),
  component: Dashboard,
})

type UploadFile = { file: File; path: string }

async function sha256File(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

type DashboardDeleteTarget = {
  siteSlug: string
  title: string
  description: string
  confirmLabel: string
}

type FileSystemEntryLike = {
  isFile: boolean
  isDirectory: boolean
  name: string
  fullPath: string
}

type FileSystemFileEntryLike = FileSystemEntryLike & {
  file: (
    success: (file: File) => void,
    error?: (error: DOMException) => void,
  ) => void
}

type FileSystemDirectoryEntryLike = FileSystemEntryLike & {
  createReader: () => {
    readEntries: (
      success: (entries: Array<FileSystemEntryLike>) => void,
      error?: (error: DOMException) => void,
    ) => void
  }
}

function formatBytes(value: number | null) {
  if (!value) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const rank = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  )
  return `${(value / 1024 ** rank).toFixed(rank ? 1 : 0)} ${units[rank]}`
}

function timeAgo(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function stripCommonRoot(files: Array<UploadFile>) {
  if (!files.length) return files
  const firstSegments = new Set(files.map((item) => item.path.split('/')[0]))
  if (
    firstSegments.size !== 1 ||
    files.some((item) => !item.path.includes('/'))
  )
    return files
  return files.map((item) => ({
    ...item,
    path: item.path.split('/').slice(1).join('/'),
  }))
}

function readFileEntry(entry: FileSystemFileEntryLike) {
  return new Promise<UploadFile>((resolve, reject) => {
    entry.file(
      (file) => resolve({ file, path: entry.fullPath.replace(/^\//, '') }),
      reject,
    )
  })
}

async function readDirectory(
  entry: FileSystemDirectoryEntryLike,
): Promise<Array<UploadFile>> {
  const reader = entry.createReader()
  const entries: Array<FileSystemEntryLike> = []
  let batch: Array<FileSystemEntryLike>
  do {
    batch = await new Promise<Array<FileSystemEntryLike>>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    )
    entries.push(...batch)
  } while (batch.length)
  const nested = await Promise.all(
    entries.map((child) =>
      child.isDirectory
        ? readDirectory(child as FileSystemDirectoryEntryLike)
        : readFileEntry(child as FileSystemFileEntryLike).then((file) => [
            file,
          ]),
    ),
  )
  return nested.flat()
}

async function filesFromDrop(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry() as FileSystemEntryLike | null)
    .filter(Boolean) as Array<FileSystemEntryLike>

  if (!entries.length) {
    return Array.from(dataTransfer.files).map((file) => ({
      file,
      path: file.name,
    }))
  }
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory
        ? readDirectory(entry as FileSystemDirectoryEntryLike)
        : readFileEntry(entry as FileSystemFileEntryLike).then((file) => [
            file,
          ]),
    ),
  )
  return stripCommonRoot(files.flat())
}

async function uploadInBatches<T>(
  values: Array<T>,
  size: number,
  worker: (value: T) => Promise<void>,
) {
  let cursor = 0
  async function run() {
    while (cursor < values.length) {
      const value = values[cursor++]
      await worker(value)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, values.length) }, run))
}

function Dashboard() {
  const { user } = Route.useRouteContext()
  const data = Route.useLoaderData()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const deploymentKey = useRef<{ fingerprint: string; key: string } | null>(
    null,
  )
  const [files, setFiles] = useState<Array<UploadFile>>([])
  const [slug, setSlug] = useState('')
  const [channel, setChannel] = useState('')
  const [spaFallback, setSpaFallback] = useState(true)
  const [privateDeploy, setPrivateDeploy] = useState(false)
  const [deployPassword, setDeployPassword] = useState('')
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<
    'idle' | 'preparing' | 'uploading' | 'finalizing' | 'done'
  >('idle')
  const [uploaded, setUploaded] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [reused, setReused] = useState(0)
  const [error, setError] = useState('')
  const [resultUrl, setResultUrl] = useState('')
  const [resultShareUrl, setResultShareUrl] = useState('')
  const [newKey, setNewKey] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [siteBusy, setSiteBusy] = useState('')
  const [deleteTarget, setDeleteTarget] =
    useState<DashboardDeleteTarget | null>(null)
  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0)

  function chooseFiles(selected: FileList | null) {
    if (!selected) return
    const next = stripCommonRoot(
      Array.from(selected).map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      })),
    )
    setFiles(next)
    deploymentKey.current = null
    setError('')
    setResultUrl('')
    setResultShareUrl('')
    setUploaded(0)
    setUploadTotal(0)
    setReused(0)
    setPhase('idle')
  }

  async function deploy() {
    if (!files.length) return
    setError('')
    setResultUrl('')
    setResultShareUrl('')
    setUploaded(0)
    setUploadTotal(0)
    setReused(0)
    setPhase('preparing')
    try {
      const checksums = new Map<string, string>()
      await uploadInBatches(files, 2, async (item) => {
        checksums.set(item.path, await sha256File(item.file))
      })
      const deploymentInput = {
        slug,
        channel: channel || undefined,
        spaFallback,
        password: privateDeploy ? deployPassword : undefined,
        source: 'web',
        files: files.map((item) => ({
          path: item.path,
          size: item.file.size,
          contentType: item.file.type || 'application/octet-stream',
          checksum: checksums.get(item.path),
        })),
      }
      const fingerprint = JSON.stringify(deploymentInput)
      if (deploymentKey.current?.fingerprint !== fingerprint) {
        deploymentKey.current = { fingerprint, key: crypto.randomUUID() }
      }
      const response = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': deploymentKey.current.key,
        },
        body: fingerprint,
      })
      const deployment = await response.json()
      if (!response.ok)
        throw new Error(
          deployment.error?.message || 'Could not start deployment.',
        )

      const localFiles = new Map(files.map((item) => [item.path, item.file]))
      setUploadTotal(deployment.uploadUrls.length)
      setReused(deployment.reusedFiles ?? 0)
      setPhase('uploading')
      await uploadInBatches(
        deployment.uploadUrls,
        6,
        async (upload: {
          path: string
          url: string
          headers: Record<string, string>
        }) => {
          const uploadResponse = await fetch(upload.url, {
            method: 'PUT',
            headers: upload.headers,
            body: localFiles.get(upload.path),
          })
          if (!uploadResponse.ok)
            throw new Error(`Upload failed for ${upload.path}.`)
          setUploaded((count) => count + 1)
        },
      )

      setPhase('finalizing')
      const completeResponse = await fetch(deployment.completeUrl, {
        method: 'POST',
      })
      const completed = await completeResponse.json()
      if (!completeResponse.ok)
        throw new Error(
          completed.error?.message || 'Could not publish deployment.',
        )
      setResultUrl(completed.url)
      setResultShareUrl(completed.shareUrl ?? '')
      setSlug(completed.site)
      setDeployPassword('')
      setPrivateDeploy(false)
      deploymentKey.current = null
      setPhase('done')
      await router.invalidate()
    } catch (uploadError) {
      setPhase('idle')
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Deployment failed.',
      )
    }
  }

  async function createKey() {
    setKeyBusy(true)
    const response = await authClient.apiKey.create({
      name: `Agent key ${new Date().toLocaleDateString()}`,
      prefix: 'yeeet_',
      expiresIn: 60 * 60 * 24 * 365,
    })
    setKeyBusy(false)
    if (response.error) {
      setError(response.error.message || 'Could not create API key.')
      return
    }
    if (!response.data.key) {
      setError('Could not create API key.')
      return
    }
    setNewKey(response.data.key)
  }

  async function deleteSite(siteSlug: string) {
    setSiteBusy(siteSlug)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/sites/${encodeURIComponent(siteSlug)}`,
        { method: 'DELETE' },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Could not delete site.')
      await router.invalidate()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete site.',
      )
      throw deleteError
    } finally {
      setSiteBusy('')
    }
  }

  async function confirmDelete() {
    const target = deleteTarget
    if (!target) return
    try {
      await deleteSite(target.siteSlug)
      setDeleteTarget(null)
    } catch {
      // The request helpers surface the error in the dashboard alert.
    }
  }

  const deleteDialogBusy = deleteTarget
    ? siteBusy === deleteTarget.siteSlug
    : false
  const mascotSeed = slug || files.at(0)?.path || 'launchpad'
  const mascot = getYeeetlingDesign(mascotSeed)
  const mascotPhase: YeeetlingPhase = error
    ? 'error'
    : phase === 'idle'
      ? files.length
        ? 'ready'
        : 'idle'
      : phase
  const mascotMessage = error
    ? 'Bonk. Let’s try that flight again.'
    : phase === 'preparing'
      ? 'Calculating maximum yeeet…'
      : phase === 'uploading'
        ? `Munching file ${Math.min(uploaded + 1, uploadTotal || files.length)} of ${uploadTotal || files.length}…`
        : phase === 'finalizing'
          ? 'YEETING to the edge!'
          : phase === 'done'
            ? 'Touchdown! Absolutely stuck it.'
            : files.length
              ? `${mascot.name} is cleared for takeoff.`
              : 'Feed me a build. I do the yeeeting.'

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />

      <main className="dashboard-main" id="main-content">
        <section className="dashboard-intro">
          <div>
            <div className="eyebrow">
              <span className="status-dot" /> Launchpad online
            </div>
            <h1>What are we yeeeting?</h1>
            <p>Drop a built site below. We’ll handle the atmosphere.</p>
          </div>
          <div className="quick-command">
            <span>$</span> yeeet deploy ./dist{' '}
            <button
              type="button"
              onClick={() =>
                navigator.clipboard.writeText('yeeet deploy ./dist')
              }
            >
              copy
            </button>
          </div>
        </section>

        <section className="deploy-card">
          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''} ${files.length ? 'has-files' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              if (phase === 'idle') setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragging(false)
            }}
            onDrop={async (event) => {
              event.preventDefault()
              setDragging(false)
              if (phase !== 'idle') return
              const dropped = await filesFromDrop(event.dataTransfer)
              setFiles(dropped)
              setError('')
              setResultUrl('')
              setResultShareUrl('')
            }}
          >
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => chooseFiles(event.target.files)}
            />
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              {...({
                webkitdirectory: '',
                directory: '',
              } as React.InputHTMLAttributes<HTMLInputElement>)}
              onChange={(event) => chooseFiles(event.target.files)}
            />
            <div className="mascot-console">
              <Yeeetling
                seed={mascotSeed}
                phase={mascotPhase}
                label={`${mascot.name}, the Yeeetling for this site`}
              />
              <p className="mascot-message" aria-live="polite">
                <b>{mascot.name}</b>
                <span>{mascotMessage}</span>
              </p>
            </div>
            {files.length ? (
              <>
                <h2>
                  {files.length.toLocaleString()} file
                  {files.length === 1 ? '' : 's'} cleared for takeoff
                </h2>
                <p>
                  {formatBytes(totalBytes)} ·{' '}
                  {files.some((item) => item.path === 'index.html')
                    ? 'index.html found'
                    : 'no index.html detected'}
                </p>
              </>
            ) : (
              <>
                <h2>Drop a folder or files here</h2>
                <p>Your files upload directly to private object storage.</p>
              </>
            )}
            <div className="drop-actions">
              <button
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => folderInput.current?.click()}
              >
                Choose folder
              </button>
              <button
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => fileInput.current?.click()}
              >
                Choose files
              </button>
            </div>
          </div>

          <div className="deploy-controls">
            <div className="deploy-controls-heading">
              <span>Launch settings</span>
              <h2>Choose the destination</h2>
              <p>Name the site, pick its routing, and send it to the edge.</p>
            </div>
            <label>
              <span>Site address</span>
              <div className="slug-input">
                <input
                  name="site-slug"
                  value={slug}
                  onChange={(event) =>
                    setSlug(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ''),
                    )
                  }
                  placeholder="Random if blank…"
                  autoComplete="off"
                  spellCheck={false}
                />
                <b>.{data.platform.siteDomain}</b>
              </div>
            </label>
            <label>
              <span>Deployment channel (optional)</span>
              <div className="slug-input">
                <input
                  name="deployment-channel"
                  value={channel}
                  onChange={(event) =>
                    setChannel(
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '')
                        .slice(0, 32),
                    )
                  }
                  placeholder="production"
                  autoComplete="off"
                  spellCheck={false}
                />
                <b>mutable alias</b>
              </div>
              <small>
                Example: staging creates a no-index site channel without moving
                production.
              </small>
            </label>
            <label className="routing-toggle">
              <input
                name="spa-fallback"
                type="checkbox"
                checked={spaFallback}
                onChange={(event) => setSpaFallback(event.target.checked)}
              />
              <span>
                <b>SPA routing</b>
                <small>Refresh any client route through index.html</small>
              </span>
            </label>
            <label className="routing-toggle">
              <input
                name="private-deploy"
                type="checkbox"
                checked={privateDeploy}
                onChange={(event) => {
                  setPrivateDeploy(event.target.checked)
                  if (!event.target.checked) setDeployPassword('')
                }}
              />
              <span>
                <b>Private sharing</b>
                <small>Password + one-click share link</small>
              </span>
            </label>
            <button
              type="button"
              className="button button-coral deploy-button"
              disabled={
                !files.length ||
                phase !== 'idle' ||
                (privateDeploy && deployPassword.length < 8)
              }
              onClick={deploy}
            >
              {phase === 'idle'
                ? 'Yeeet it ↗'
                : phase === 'preparing'
                  ? 'Plotting course…'
                  : phase === 'uploading'
                    ? `Uploading ${uploaded}/${uploadTotal || files.length}`
                    : phase === 'done'
                      ? 'Landed ✓'
                      : 'Going live…'}
            </button>
            {privateDeploy ? (
              <label className="private-password">
                <span>Deployment password</span>
                <input
                  name="deployment-password"
                  type="password"
                  value={deployPassword}
                  onChange={(event) => setDeployPassword(event.target.value)}
                  placeholder="At least 8 characters…"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                />
                <small>
                  Viewers can enter this password or use the generated share
                  link without an account.
                </small>
              </label>
            ) : null}
          </div>
          {phase === 'uploading' || phase === 'finalizing' ? (
            <div className="upload-progress">
              <span
                style={{
                  width: `${phase === 'finalizing' ? 100 : (uploaded / (uploadTotal || files.length)) * 100}%`,
                }}
              />
            </div>
          ) : null}
          {error ? (
            <p className="form-error deploy-error" role="alert">
              {error}
            </p>
          ) : null}
          {resultUrl ? (
            <div className="deploy-success" aria-live="polite">
              <span>✓</span>
              <div>
                <b>Touchdown.</b>
                <a href={resultUrl} target="_blank" rel="noreferrer">
                  {resultUrl}
                </a>
                {resultShareUrl ? (
                  <small>Private deployment · share link is ready</small>
                ) : null}
                {reused ? (
                  <small>
                    {reused} unchanged {reused === 1 ? 'file' : 'files'} reused
                    without upload
                  </small>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(resultShareUrl || resultUrl)
                }
              >
                {resultShareUrl ? 'Copy share link' : 'Copy URL'}
              </button>
            </div>
          ) : null}
        </section>

        <section className="dashboard-grid">
          <div className="sites-panel panel">
            <div className="panel-heading">
              <div>
                <span>YOUR FLEET</span>
                <h2>Live sites</h2>
              </div>
              <b>{data.sites.length}</b>
            </div>
            {data.sites.length ? (
              <div className="site-list">
                {data.sites.map((site) => (
                  <div className="site-row" key={site.id}>
                    <span className="site-icon site-mascot">
                      <Yeeetling
                        seed={site.slug}
                        compact
                        label={`${getYeeetlingDesign(site.slug).name}, ${site.slug}’s Yeeetling`}
                      />
                    </span>
                    <Link
                      className="site-name"
                      to="/dashboard/sites/$slug"
                      params={{ slug: site.slug }}
                    >
                      <b>{site.slug}</b>
                      <small>
                        {site.slug}.{data.platform.siteDomain}
                      </small>
                    </Link>
                    <span className="site-meta">
                      <b>{site.fileCount ?? 0} files</b>
                      <small>
                        {site.activeDeploymentId
                          ? `${formatBytes(site.totalBytes)} · ${site.spaFallback ? 'SPA' : 'static'} · ${site.protected ? 'private' : 'public'}`
                          : 'no live version'}
                      </small>
                    </span>
                    <span className="site-time">
                      <i /> {timeAgo(site.updatedAt)}
                    </span>
                    <span className="site-row-actions">
                      <Link
                        to="/dashboard/sites/$slug/analytics"
                        params={{ slug: site.slug }}
                      >
                        Analytics
                      </Link>
                      <Link
                        to="/dashboard/sites/$slug/domains"
                        params={{ slug: site.slug }}
                      >
                        Domains
                        {site.customDomains.length
                          ? ` (${site.customDomains.length})`
                          : ''}
                      </Link>
                      <Link
                        to="/dashboard/sites/$slug/versions"
                        params={{ slug: site.slug }}
                      >
                        Versions
                      </Link>
                      <button
                        type="button"
                        className="danger-link"
                        disabled={siteBusy === site.slug}
                        onClick={() =>
                          setDeleteTarget({
                            siteSlug: site.slug,
                            title: `Delete ${site.slug}?`,
                            description:
                              'Every version, custom-domain mapping, and stored file will be permanently removed. This cannot be undone.',
                            confirmLabel: 'Delete entire site',
                          })
                        }
                      >
                        {siteBusy === site.slug ? 'Deleting…' : 'Delete'}
                      </button>
                      <a
                        href={site.url}
                        target="_blank"
                        rel="noreferrer"
                        className="site-open"
                        aria-label={`Open ${site.slug} in a new tab`}
                      >
                        ↗
                      </a>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">Your first site will land here.</div>
            )}
          </div>

          <aside className="agent-panel panel">
            <div className="panel-heading">
              <div>
                <span>AUTOMATION</span>
                <h2>Agent access</h2>
              </div>
              <span className="robot">⌘</span>
            </div>
            <p>
              Create a one-year API key for CI or an agent. It is shown once.
            </p>
            {newKey ? (
              <div className="key-reveal">
                <code>{newKey}</code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(newKey)}
                >
                  Copy key
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button button-ink key-button"
                onClick={createKey}
                disabled={keyBusy}
              >
                {keyBusy ? 'Minting…' : 'Create API key'}
              </button>
            )}
            <pre>
              <code>YEEET_TOKEN=yeeet_… yeeet deploy ./dist --json</code>
            </pre>
            <Link to="/device" search={{ user_code: undefined }}>
              CLI device login →
            </Link>
          </aside>
        </section>

        <section className="activity-panel panel">
          <div className="panel-heading">
            <div>
              <span>FLIGHT LOG</span>
              <h2>Recent deployments</h2>
            </div>
          </div>
          {data.deployments.length ? (
            <div className="activity-list">
              {data.deployments.map((deployment) => (
                <div className="activity-row" key={deployment.id}>
                  <span className={`activity-status ${deployment.status}`}>
                    {deployment.status === 'ready'
                      ? '✓'
                      : deployment.status === 'failed'
                        ? '!'
                        : '↑'}
                  </span>
                  <span>
                    <b>{deployment.slug}</b>
                    <small>
                      {deployment.id.slice(0, 8)} · {deployment.source}
                    </small>
                  </span>
                  <span>
                    {deployment.fileCount} files ·{' '}
                    {formatBytes(deployment.totalBytes)}
                  </span>
                  <time>{timeAgo(deployment.createdAt)}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">No flights logged yet.</div>
          )}
        </section>
      </main>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget?.title ?? ''}
        description={deleteTarget?.description ?? ''}
        confirmLabel={deleteTarget?.confirmLabel ?? 'Delete'}
        busy={deleteDialogBusy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}

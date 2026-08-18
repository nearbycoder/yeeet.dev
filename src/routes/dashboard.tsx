import { Fragment, useEffect, useRef, useState } from 'react'
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { Brand } from '#/components/brand'
import { ConfirmDialog } from '#/components/confirm-dialog'
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

type CustomDomainData = {
  id: string
  hostname: string
  url: string
  verificationToken: string | null
  verificationHost: string | null
  certificateStatus: string
  error: string | null
  dnsRecords: Array<{
    hostlabel: string
    requiredValue: string
    currentValue?: string | null
    status: string
  }>
}

type VersionHistoryData = {
  site: {
    id: string
    slug: string
    url: string
    activeDeploymentId: string | null
  }
  versions: Array<{
    id: string
    status: 'uploading' | 'ready' | 'failed'
    source: string
    fileCount: number
    totalBytes: number
    current: boolean
    previewUrl: string | null
    spaFallback: boolean
    protected: boolean
    shareUrl: string | null
    createdAt: string
  }>
}

type DashboardDeleteTarget =
  | {
      kind: 'version'
      deploymentId: string
      title: string
      description: string
      confirmLabel: string
    }
  | {
      kind: 'site'
      siteSlug: string
      title: string
      description: string
      confirmLabel: string
    }
  | {
      kind: 'domain'
      siteSlug: string
      domain: CustomDomainData
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

function VersionHistory(props: {
  data: VersionHistoryData
  busy: string
  onActivate: (id: string) => void
  onDelete: (id: string) => void
  onAccess: (
    id: string,
    input: { password?: string | null; rotateShareLink?: boolean },
  ) => Promise<void>
  onClose: () => void
}) {
  const [accessVersion, setAccessVersion] = useState('')
  const [password, setPassword] = useState('')
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [props.onClose])
  const currentIndex = props.data.versions.findIndex(
    (version) => version.current,
  )
  const previous =
    currentIndex >= 0
      ? props.data.versions
          .slice(currentIndex + 1)
          .find((version) => version.status === 'ready')
      : undefined

  const headingId = `version-history-${props.data.site.slug}`

  return (
    <div className="version-drawer-shell">
      <button
        type="button"
        className="version-drawer-backdrop"
        aria-label="Close version history"
        onClick={props.onClose}
      />
      <section
        className="version-drawer"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        <div className="version-heading">
          <div>
            <span>VERSION HISTORY</span>
            <h3 id={headingId}>{props.data.site.slug}</h3>
          </div>
          <button type="button" onClick={props.onClose}>
            Close
          </button>
        </div>
        {previous ? (
          <button
            type="button"
            className="button button-ink version-rollback"
            disabled={Boolean(props.busy)}
            onClick={() => props.onActivate(previous.id)}
          >
            Roll back to previous
          </button>
        ) : null}
        <div className="version-list">
          {props.data.versions.length === 0 ? (
            <p className="version-empty">
              No versions remain. Deploy new files to bring this site back
              online.
            </p>
          ) : null}
          {props.data.versions.map((version, index) => (
            <Fragment key={version.id}>
              <div
                className={`version-row ${version.current ? 'is-current' : ''}`}
              >
                <span className="version-number">
                  v{props.data.versions.length - index}
                </span>
                <span className="version-details">
                  <b>{version.id.slice(0, 8)}</b>
                  <small>
                    {version.source} · {timeAgo(version.createdAt)}
                    {' · '}
                    {version.spaFallback ? 'SPA' : 'static'} ·{' '}
                    {version.protected ? 'private' : 'public'}
                  </small>
                </span>
                <span className="version-size">
                  {version.fileCount} files · {formatBytes(version.totalBytes)}
                </span>
                <span
                  className={`state-pill ${version.status === 'ready' ? 'live' : 'blocked'}`}
                >
                  {version.current ? 'live' : version.status}
                </span>
                <span className="version-actions">
                  {version.previewUrl ? (
                    <a
                      href={version.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview ↗
                    </a>
                  ) : null}
                  {version.shareUrl ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(version.shareUrl!)
                      }
                    >
                      Copy share link
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setAccessVersion(
                        accessVersion === version.id ? '' : version.id,
                      )
                      setPassword('')
                    }}
                  >
                    {version.protected ? 'Access' : 'Protect'}
                  </button>
                  {!version.current && version.status === 'ready' ? (
                    <button
                      type="button"
                      disabled={Boolean(props.busy)}
                      onClick={() => props.onActivate(version.id)}
                    >
                      {props.busy === version.id ? 'Switching…' : 'Make live'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="danger-link"
                    disabled={Boolean(props.busy)}
                    onClick={() => props.onDelete(version.id)}
                  >
                    {props.busy === `delete-${version.id}`
                      ? 'Deleting…'
                      : 'Delete'}
                  </button>
                </span>
              </div>
              {accessVersion === version.id ? (
                <form
                  className="version-access-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (password.length < 8) return
                    void props
                      .onAccess(version.id, { password })
                      .then(() => {
                        setPassword('')
                        setAccessVersion('')
                      })
                      .catch(() => undefined)
                  }}
                >
                  <div>
                    <b>
                      {version.protected
                        ? 'Change password'
                        : 'Password protect this version'}
                    </b>
                    <small>
                      Share links bypass the password without requiring an
                      account.
                    </small>
                  </div>
                  <label>
                    <span className="sr-only">Deployment password</span>
                    <input
                      name="version-password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters…"
                      minLength={8}
                      maxLength={128}
                      autoComplete="new-password"
                    />
                  </label>
                  <button
                    type="submit"
                    className="button button-coral"
                    disabled={password.length < 8 || Boolean(props.busy)}
                  >
                    Save password
                  </button>
                  {version.protected ? (
                    <>
                      <button
                        type="button"
                        disabled={Boolean(props.busy)}
                        onClick={() => {
                          if (!window.confirm('Make this version public?'))
                            return
                          void props.onAccess(version.id, { password: null })
                        }}
                      >
                        Make public
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(props.busy)}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Rotate this share link? The old link will stop working.',
                            )
                          )
                            return
                          void props.onAccess(version.id, {
                            rotateShareLink: true,
                          })
                        }}
                      >
                        Rotate share link
                      </button>
                    </>
                  ) : null}
                </form>
              ) : null}
            </Fragment>
          ))}
        </div>
        <p className="version-note">
          Live aliases revalidate at the edge within about 10 seconds. Version
          preview URLs never change.
        </p>
      </section>
    </div>
  )
}

function DomainManager(props: {
  site: { slug: string; customDomains: Array<CustomDomainData> }
  busy: string
  onAdd: (hostname: string) => Promise<void>
  onRefresh: (id: string) => Promise<void>
  onDelete: (domain: CustomDomainData) => void
  onClose: () => void
}) {
  const [hostname, setHostname] = useState('')

  return (
    <div className="domain-drawer">
      <div className="version-heading">
        <div>
          <span>CUSTOM DOMAINS</span>
          <h3>{props.site.slug}</h3>
        </div>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </div>
      <form
        className="domain-add"
        onSubmit={(event) => {
          event.preventDefault()
          if (!hostname.trim()) return
          void props
            .onAdd(hostname)
            .then(() => setHostname(''))
            .catch(() => undefined)
        }}
      >
        <label>
          <span>Hostname</span>
          <input
            name="custom-domain"
            value={hostname}
            onChange={(event) => setHostname(event.target.value)}
            placeholder="e.g. docs.example.com…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button
          type="submit"
          className="button button-paper"
          disabled={!hostname.trim() || Boolean(props.busy)}
        >
          {props.busy === 'add' ? 'Attaching…' : 'Attach domain'}
        </button>
      </form>
      {props.site.customDomains.length ? (
        <div className="domain-list">
          {props.site.customDomains.map((domain) => (
            <article key={domain.id} className="domain-card">
              <div className="domain-card-heading">
                <a href={domain.url} target="_blank" rel="noreferrer">
                  {domain.hostname} ↗
                </a>
                <span
                  className={`state-pill ${domain.certificateStatus === 'ISSUED' ? 'live' : 'admin'}`}
                >
                  TLS {domain.certificateStatus.toLowerCase()}
                </span>
              </div>
              <p>
                Add both the routing and ownership records at your DNS host.
              </p>
              <div className="dns-records">
                {domain.dnsRecords.map((record) => (
                  <code key={`${record.hostlabel}-${record.requiredValue}`}>
                    <i>{record.status === 'VALID' ? '✓' : '→'}</i>{' '}
                    {record.hostlabel} CNAME {record.requiredValue}
                  </code>
                ))}
                {domain.verificationToken ? (
                  <code>
                    <i>→</i> {domain.verificationHost} TXT{' '}
                    {domain.verificationToken}
                  </code>
                ) : null}
              </div>
              <div className="domain-actions">
                <button
                  type="button"
                  disabled={Boolean(props.busy)}
                  onClick={() => props.onRefresh(domain.id)}
                >
                  {props.busy === `refresh-${domain.id}`
                    ? 'Checking…'
                    : 'Refresh status'}
                </button>
                <button
                  type="button"
                  className="danger-link"
                  disabled={Boolean(props.busy)}
                  onClick={() => props.onDelete(domain)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="domain-empty">No custom domains attached yet.</p>
      )}
    </div>
  )
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
  const [files, setFiles] = useState<Array<UploadFile>>([])
  const [slug, setSlug] = useState('')
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
  const [history, setHistory] = useState<VersionHistoryData | null>(null)
  const [historyLoading, setHistoryLoading] = useState('')
  const [versionBusy, setVersionBusy] = useState('')
  const [domainSiteSlug, setDomainSiteSlug] = useState('')
  const [domainBusy, setDomainBusy] = useState('')
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
      const response = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          spaFallback,
          password: privateDeploy ? deployPassword : undefined,
          source: 'web',
          files: files.map((item) => ({
            path: item.path,
            size: item.file.size,
            contentType: item.file.type || 'application/octet-stream',
            checksum: checksums.get(item.path),
          })),
        }),
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

  async function showVersions(siteSlug: string) {
    setHistoryLoading(siteSlug)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/sites/${encodeURIComponent(siteSlug)}/versions`,
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Could not load versions.')
      setHistory(body)
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? historyError.message
          : 'Could not load versions.',
      )
    } finally {
      setHistoryLoading('')
    }
  }

  async function activateVersion(deploymentId: string) {
    if (!history) return
    if (
      !window.confirm(
        `Make version ${deploymentId.slice(0, 8)} live on ${history.site.slug}?`,
      )
    )
      return
    setVersionBusy(deploymentId)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/sites/${encodeURIComponent(history.site.slug)}/versions/${deploymentId}/activate`,
        { method: 'POST' },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Could not activate version.')
      await Promise.all([showVersions(history.site.slug), router.invalidate()])
    } catch (activateError) {
      setError(
        activateError instanceof Error
          ? activateError.message
          : 'Could not activate version.',
      )
    } finally {
      setVersionBusy('')
    }
  }

  async function updateVersionAccess(
    deploymentId: string,
    input: { password?: string | null; rotateShareLink?: boolean },
  ) {
    if (!history) return
    setVersionBusy(`access-${deploymentId}`)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/sites/${encodeURIComponent(history.site.slug)}/versions/${deploymentId}/access`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(input),
        },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Could not update access.')
      await Promise.all([showVersions(history.site.slug), router.invalidate()])
    } catch (accessError) {
      setError(
        accessError instanceof Error
          ? accessError.message
          : 'Could not update access.',
      )
      throw accessError
    } finally {
      setVersionBusy('')
    }
  }

  async function deleteVersion(deploymentId: string) {
    if (!history) return
    setVersionBusy(`delete-${deploymentId}`)
    setError('')
    try {
      const response = await fetch(
        `/api/v1/sites/${encodeURIComponent(history.site.slug)}/versions/${deploymentId}`,
        { method: 'DELETE' },
      )
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Could not delete version.')
      await Promise.all([showVersions(history.site.slug), router.invalidate()])
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete version.',
      )
      throw deleteError
    } finally {
      setVersionBusy('')
    }
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
      if (history?.site.slug === siteSlug) setHistory(null)
      if (domainSiteSlug === siteSlug) setDomainSiteSlug('')
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

  async function domainRequest(
    key: string,
    path: string,
    init: RequestInit = {},
  ) {
    setDomainBusy(key)
    setError('')
    try {
      const response = await fetch(path, init)
      const body = await response.json()
      if (!response.ok)
        throw new Error(body.error?.message || 'Custom-domain action failed.')
      await router.invalidate()
    } catch (domainError) {
      setError(
        domainError instanceof Error
          ? domainError.message
          : 'Custom-domain action failed.',
      )
      throw domainError
    } finally {
      setDomainBusy('')
    }
  }

  async function confirmDelete() {
    const target = deleteTarget
    if (!target) return
    try {
      if (target.kind === 'version') {
        await deleteVersion(target.deploymentId)
      } else if (target.kind === 'site') {
        await deleteSite(target.siteSlug)
      } else {
        await domainRequest(
          `delete-${target.domain.id}`,
          `/api/v1/sites/${encodeURIComponent(target.siteSlug)}/domains/${target.domain.id}`,
          { method: 'DELETE' },
        )
      }
      setDeleteTarget(null)
    } catch {
      // The request helpers surface the error in the dashboard alert.
    }
  }

  const domainSite = data.sites.find((site) => site.slug === domainSiteSlug)
  const deleteDialogBusy = deleteTarget
    ? deleteTarget.kind === 'version'
      ? versionBusy === `delete-${deleteTarget.deploymentId}`
      : deleteTarget.kind === 'site'
        ? siteBusy === deleteTarget.siteSlug
        : domainBusy === `delete-${deleteTarget.domain.id}`
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
      <header className="dashboard-header">
        <Brand />
        <nav>
          <Link to="/mascot" className="mascot-lab-link">
            Yeeetlings
          </Link>
          <a href={data.platform.docsUrl} className="agent-docs-link">
            Docs
          </a>
          {(user as { role?: string }).role?.split(',').includes('admin') ? (
            <Link to="/admin">Admin</Link>
          ) : null}
          <span className="user-chip">
            <span>
              {user.image ? (
                <img src={user.image} alt="" width="30" height="30" />
              ) : (
                user.name.slice(0, 1).toUpperCase()
              )}
            </span>
            {user.name}
          </span>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut()
              window.location.assign('/')
            }}
          >
            Sign out
          </button>
        </nav>
      </header>

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
                    <span className="site-name">
                      <b>{site.slug}</b>
                      <small>
                        {site.slug}.{data.platform.siteDomain}
                      </small>
                    </span>
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
                      <button
                        type="button"
                        onClick={() => setDomainSiteSlug(site.slug)}
                      >
                        Domains
                        {site.customDomains.length
                          ? ` (${site.customDomains.length})`
                          : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => showVersions(site.slug)}
                      >
                        {historyLoading === site.slug ? '…' : 'Versions'}
                      </button>
                      <button
                        type="button"
                        className="danger-link"
                        disabled={siteBusy === site.slug}
                        onClick={() =>
                          setDeleteTarget({
                            kind: 'site',
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
            {history ? (
              <VersionHistory
                data={history}
                busy={versionBusy}
                onActivate={activateVersion}
                onDelete={(deploymentId) => {
                  const version = history.versions.find(
                    (item) => item.id === deploymentId,
                  )
                  setDeleteTarget({
                    kind: 'version',
                    deploymentId,
                    title: `Delete version ${deploymentId.slice(0, 8)}?`,
                    description: version?.current
                      ? 'This is the live version. The newest remaining ready version will become live automatically.'
                      : 'This immutable version and every stored file belonging to it will be permanently removed.',
                    confirmLabel: version?.current
                      ? 'Delete live version'
                      : 'Delete version',
                  })
                }}
                onAccess={updateVersionAccess}
                onClose={() => setHistory(null)}
              />
            ) : null}
            {domainSite ? (
              <DomainManager
                site={domainSite}
                busy={domainBusy}
                onClose={() => setDomainSiteSlug('')}
                onAdd={(hostname) =>
                  domainRequest(
                    'add',
                    `/api/v1/sites/${encodeURIComponent(domainSite.slug)}/domains`,
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ domain: hostname }),
                    },
                  )
                }
                onRefresh={(id) =>
                  domainRequest(
                    `refresh-${id}`,
                    `/api/v1/sites/${encodeURIComponent(domainSite.slug)}/domains/${id}/refresh`,
                    { method: 'POST' },
                  )
                }
                onDelete={(domain) =>
                  setDeleteTarget({
                    kind: 'domain',
                    siteSlug: domainSite.slug,
                    domain,
                    title: `Remove ${domain.hostname}?`,
                    description: `Managed TLS and routing to ${domainSite.slug} will stop. The site and its versions will stay intact.`,
                    confirmLabel: 'Remove domain',
                  })
                }
              />
            ) : null}
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

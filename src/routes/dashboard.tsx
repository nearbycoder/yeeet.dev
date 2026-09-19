import { deployCommand } from '#/lib/deploy-command'
import { mergeUploadFiles } from '#/lib/merge-upload-files'
import { uploadLimitErrors } from '#/lib/upload-limits'
import { DeploymentPresets } from '#/components/deployment-presets'
import { publishFolders, selectPublishFolder } from '#/lib/publish-folder'
import { useOnlineStatus } from '#/lib/online-status'
import { UnsavedWorkGuard } from '#/components/unsaved-work-guard'
import { RecentSites } from '#/components/recent-sites'
import { SavedViews } from '#/components/saved-views'
import { deploymentPreflight } from '#/lib/deployment-preflight'
import { DeploymentPreflight } from '#/components/deployment-preflight'
import { UploadSelection } from '#/components/upload-selection'
import {
  hashUploadFiles,
  parseRecovery,
  recoveryStorageKey,
  recoveryFingerprint,
  retryUpload,
  uploadPool,
} from '#/lib/browser-upload'
import type { UploadFile, UploadRecovery } from '#/lib/browser-upload'
import { ManifestDiff } from '#/components/manifest-diff'
import type { ManifestDiffData } from '#/components/manifest-diff'
import { z } from 'zod'
import { CopyButton } from '#/components/copy-button'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { siteSearchSchema } from '#/lib/pagination'

export const Route = createFileRoute('/dashboard')({
  validateSearch: siteSearchSchema.extend({
    site: z.string().optional(),
    channel: z.string().optional(),
  }),
  beforeLoad: async () => {
    const session = await getSession()
    if (!session)
      throw redirect({ to: '/login', search: { redirect: '/dashboard' } })
    return { user: session.user }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getDashboardData({ data: deps }),
  component: Dashboard,
})

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

function Dashboard() {
  const { user } = Route.useRouteContext()
  const destination = Route.useSearch()
  const data = Route.useLoaderData()
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const additionalInput = useRef<HTMLInputElement>(null)
  const uploadController = useRef<AbortController | null>(null)
  const hashedFiles = useRef<{
    files: Array<UploadFile>
    checksums: Map<string, string>
  } | null>(null)
  const recoveryRef = useRef<UploadRecovery | null>(null)
  const [recovery, setRecovery] = useState<UploadRecovery | null>(null)
  const [recoveryWarning, setRecoveryWarning] = useState('')
  const [hashedCount, setHashedCount] = useState(0)
  const storageKey = recoveryStorageKey(user.id)
  useEffect(() => {
    try {
      const saved = parseRecovery(localStorage.getItem(storageKey))
      recoveryRef.current = saved
      setRecovery(saved)
    } catch {
      setRecoveryWarning(
        'Recovery across reloads is unavailable. Keep this tab open while uploading.',
      )
    }
    return () => uploadController.current?.abort()
  }, [storageKey])
  function saveRecovery(saved: UploadRecovery | null) {
    recoveryRef.current = saved
    setRecovery(saved)
    try {
      if (saved) localStorage.setItem(storageKey, JSON.stringify(saved))
      else localStorage.removeItem(storageKey)
    } catch {
      setRecoveryWarning(
        'Recovery across reloads is unavailable. Keep this tab open while uploading.',
      )
    }
  }
  const [files, setFiles] = useState<Array<UploadFile>>([])
  const [sourceFiles, setSourceFiles] = useState<Array<UploadFile>>([])
  const [publishRoot, setPublishRoot] = useState('')
  const folderChoices = useMemo(
    () => publishFolders(sourceFiles),
    [sourceFiles],
  )
  const [originalFiles, setOriginalFiles] = useState<Array<UploadFile>>([])
  const [slug, setSlug] = useState(destination.site ?? '')
  const [channel, setChannel] = useState(destination.channel ?? '')
  const [spaFallback, setSpaFallback] = useState(
    data.destinationSite?.spaFallback ?? true,
  )
  const [privateDeploy, setPrivateDeploy] = useState(
    data.destinationSite?.protected ?? false,
  )
  const [deployPassword, setDeployPassword] = useState('')
  const advancedOptions = useRef<HTMLDetailsElement>(null)
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
  const [keyError, setKeyError] = useState('')
  const [siteBusy, setSiteBusy] = useState('')
  const filters = Route.useSearch()
  const navigate = Route.useNavigate()
  const projectGroup = filters.group ?? ''
  const favoritesOnly = filters.favorites ?? false
  const projectGroups = data.projectGroups
  const [siteSearch, setSiteSearch] = useState(filters.q ?? '')
  const siteStatus = filters.status ?? 'all'
  const matchingSites = data.sites
  useEffect(() => {
    setSiteSearch(filters.q ?? '')
  }, [filters.q])
  const changeFilters = (next: Partial<typeof filters>) =>
    void navigate({
      search: { ...filters, ...next, cursor: undefined },
      resetScroll: false,
    })
  const [deleteTarget, setDeleteTarget] =
    useState<DashboardDeleteTarget | null>(null)
  const [review, setReview] = useState<{
    files: Array<UploadFile>
    options: string
    diff: ManifestDiffData
    baseDeploymentId: string | null
    targetUrl: string | null
  } | null>(null)
  const reviewOptions = JSON.stringify({
    slug,
    channel,
    spaFallback,
    privateDeploy,
    deployPassword,
  })
  const reviewIsCurrent =
    review?.files === files && review.options === reviewOptions
  const busy = phase !== 'idle' && phase !== 'done'
  const online = useOnlineStatus()
  useEffect(() => {
    if (!online) uploadController.current?.abort()
  }, [online])
  const preflight = useMemo(
    () =>
      deploymentPreflight(
        files.map((item) => ({ path: item.path, size: item.file.size })),
        spaFallback,
      ),
    [files, spaFallback],
  )
  function showAdvanced() {
    if (advancedOptions.current) advancedOptions.current.open = true
    advancedOptions.current?.querySelector('summary')?.focus()
  }
  const totalBytes = files.reduce((sum, item) => sum + item.file.size, 0)
  const limitErrors = uploadLimitErrors(
    files.length,
    totalBytes,
    data.platform.uploadLimits,
  )

  useEffect(() => {
    function pasteFiles(event: ClipboardEvent) {
      if (busy || !event.clipboardData?.files.length) return
      const target = event.target
      if (
        target instanceof Element &&
        (target.closest('input, textarea') ||
          (target instanceof HTMLElement && target.isContentEditable))
      )
        return
      event.preventDefault()
      chooseFiles(event.clipboardData.files)
    }
    document.addEventListener('paste', pasteFiles)
    return () => document.removeEventListener('paste', pasteFiles)
  }, [busy])

  function chooseFiles(selected: FileList | null) {
    if (!selected) return
    const next = stripCommonRoot(
      Array.from(selected).map((file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      })),
    )
    selectFiles(next)
  }

  function selectFiles(next: Array<UploadFile>, source = next) {
    setSourceFiles(source)
    setPublishRoot('')
    setReview(null)
    setOriginalFiles(next)
    setFiles(next)
    setError('')
    setResultUrl('')
    setResultShareUrl('')
    setUploaded(0)
    setUploadTotal(0)
    setReused(0)
    setPhase('idle')
  }

  function startFreshSite() {
    selectFiles([])
    hashedFiles.current = null
    setSlug('')
    setChannel('')
    setSpaFallback(true)
    setPrivateDeploy(false)
    setDeployPassword('')
    if (advancedOptions.current) advancedOptions.current.open = false
    saveRecovery(null)
    void navigate({
      search: { ...filters, site: undefined, channel: undefined },
      resetScroll: false,
    })
    fileInput.current?.closest('.dropzone')?.querySelector('button')?.focus()
  }

  async function deploy(previewOnly = false) {
    if (!files.length || !online || limitErrors.length) return
    setError('')
    setResultUrl('')
    setResultShareUrl('')
    setUploaded(0)
    setUploadTotal(0)
    setReused(0)
    if (uploadController.current) return
    const controller = new AbortController()
    uploadController.current = controller
    const signal = controller.signal
    setPhase('preparing')
    setHashedCount(0)
    try {
      const checksums =
        hashedFiles.current?.files === files
          ? hashedFiles.current.checksums
          : await hashUploadFiles(files, signal, setHashedCount)
      hashedFiles.current = { files, checksums }
      signal.throwIfAborted()
      const deploymentInput = {
        slug,
        channel: channel || undefined,
        spaFallback,
        password: privateDeploy ? deployPassword : undefined,
        source: 'web',
        files: files
          .map((item) => ({
            path: item.path,
            size: item.file.size,
            contentType: item.file.type || 'application/octet-stream',
            checksum: checksums.get(item.path),
          }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      }
      if (previewOnly) {
        const response = await fetch('/api/v1/deployments', {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...deploymentInput,
            password: undefined,
            dryRun: true,
          }),
        })
        const plan = await response.json()
        if (!response.ok)
          throw new Error(plan.error?.message || 'Could not preview changes.')
        setReview({
          files,
          options: reviewOptions,
          diff: plan,
          baseDeploymentId: plan.baseDeploymentId,
          targetUrl: plan.targetUrl,
        })
        setPhase('idle')
        return
      }
      const fingerprint = await recoveryFingerprint({
        ...deploymentInput,
        password: undefined,
        privateDeploy,
      })
      if (
        recoveryRef.current &&
        recoveryRef.current.fingerprint !== fingerprint
      )
        throw new Error(
          'This build differs from the saved attempt. Restore its files and settings, or forget the saved attempt to start a new deployment.',
        )
      const attempt = recoveryRef.current ?? {
        version: 1 as const,
        key: crypto.randomUUID(),
        fingerprint,
        createdAt: Date.now(),
        slug,
        channel,
        spaFallback,
        privateDeploy,
      }
      saveRecovery(attempt)
      const response = await fetch('/api/v1/deployments', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': attempt.key,
        },
        body: JSON.stringify(deploymentInput),
        signal,
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
      await uploadPool(
        deployment.uploadUrls,
        6,
        signal,
        async (upload: {
          path: string
          url: string
          headers: Record<string, string>
        }) => {
          const file = localFiles.get(upload.path)
          if (!file)
            throw new Error(`Select the original file: ${upload.path}.`)
          await retryUpload(async () => {
            const uploadResponse = await fetch(upload.url, {
              method: 'PUT',
              headers: upload.headers,
              body: file,
              signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
            })
            if (!uploadResponse.ok)
              throw new Error(
                `Upload failed for ${upload.path}. Resume to refresh upload links and retry missing files.`,
              )
          }, signal)
          setUploaded((count) => count + 1)
        },
      )

      signal.throwIfAborted()
      setPhase('finalizing')
      const completeResponse = await fetch(deployment.completeUrl, {
        method: 'POST',
        signal,
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
      saveRecovery(null)
      setReview(null)
      setPhase('done')
      await router.invalidate()
    } catch (uploadError) {
      setPhase('idle')
      setError(
        signal.aborted
          ? 'Upload paused. Select Resume upload when you are ready.'
          : uploadError instanceof Error
            ? uploadError.message
            : 'Deployment failed.',
      )
    } finally {
      uploadController.current = null
    }
  }

  async function createKey() {
    setKeyBusy(true)
    setKeyError('')
    try {
      const response = await authClient.apiKey.create({
        name: `Agent key ${new Date().toLocaleDateString()}`,
        prefix: 'yeeet_',
        expiresIn: 60 * 60 * 24 * 365,
      })
      if (response.error) {
        setKeyError(response.error.message || 'Could not create API key.')
        return
      }
      if (!response.data.key) {
        setKeyError('Could not create API key.')
        return
      }
      setNewKey(response.data.key)
    } catch {
      setKeyError(
        'Could not create an API key. Check your connection and try again.',
      )
    } finally {
      setKeyBusy(false)
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
      <UnsavedWorkGuard
        dirty={files.length > 0 && phase !== 'done'}
        watchSearch={false}
        description="Your selected files are only kept in this tab. Leaving will pause any upload and clear the selection."
      />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <DashboardHeader user={user} docsUrl={data.platform.docsUrl} />

      <main className="dashboard-main" id="main-content" tabIndex={-1}>
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
            <CopyButton value={'yeeet deploy ./dist'} label="copy" />
          </div>
        </section>

        {recovery ? (
          <section className="panel site-page-panel" aria-label="Saved upload">
            <h2>Saved upload attempt</h2>
            <p>
              {recovery.slug || 'Generated site'}
              {recovery.channel ? ` · ${recovery.channel}` : ''}. Reselect the
              original files to resume after a reload. Files and passwords are
              never saved in the browser; private deployments need the same
              password again.
            </p>
            <div className="console-actions">
              <button
                className="button button-paper"
                disabled={phase !== 'idle'}
                onClick={() => {
                  setSlug(recovery.slug)
                  setChannel(recovery.channel)
                  setSpaFallback(recovery.spaFallback)
                  setPrivateDeploy(recovery.privateDeploy)
                  setReview(null)
                }}
              >
                Restore destination settings
              </button>
              <button
                className="button danger-link"
                disabled={phase !== 'idle'}
                onClick={() => saveRecovery(null)}
              >
                Forget saved attempt
              </button>
            </div>
          </section>
        ) : null}
        {recoveryWarning ? <p role="status">{recoveryWarning}</p> : null}
        <section className="deploy-card quick-deploy-card">
          <div
            className={`dropzone ${dragging ? 'is-dragging' : ''} ${files.length ? 'has-files' : ''}`}
            onDragEnter={(event) => {
              event.preventDefault()
              if (!busy) setDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragging(false)
            }}
            onDrop={async (event) => {
              event.preventDefault()
              setDragging(false)
              if (busy) return
              setPhase('preparing')
              try {
                selectFiles(await filesFromDrop(event.dataTransfer))
              } catch {
                setPhase('idle')
                setError(
                  'Could not read those files. Try Choose files or Choose folder.',
                )
              }
            }}
          >
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              disabled={busy}
              onChange={(event) => {
                chooseFiles(event.target.files)
                event.target.value = ''
              }}
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
              disabled={busy}
              onChange={(event) => {
                chooseFiles(event.target.files)
                event.target.value = ''
              }}
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
                <p>
                  Drop your built site or paste copied files, then click Deploy.
                </p>
              </>
            )}
            <div className="drop-actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => folderInput.current?.click()}
              >
                Choose folder
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                Choose files
              </button>
            </div>
          </div>

          <div className="deploy-controls quick-deploy-controls">
            <div className="deploy-controls-heading">
              <span>Quick deploy</span>
              <h2>Drop. Deploy. Done.</h2>
              <p>
                Choose your files and get a shareable link. No setup required.
              </p>
            </div>
            <p
              className="deploy-destination"
              aria-label="Deployment destination"
            >
              <strong>
                {slug
                  ? `${slug}.${data.platform.siteDomain}`
                  : 'New site · automatic address'}
              </strong>
              <span>
                {channel
                  ? `${channel} channel · production stays unchanged`
                  : slug
                    ? 'Updates this site’s production version'
                    : 'Publishes a new site'}{' '}
                · {privateDeploy ? 'Password protected' : 'Public'}
              </span>
            </p>
            {privateDeploy ? (
              <label className="private-password">
                <span>Deployment password</span>
                <input
                  name="deployment-password"
                  disabled={busy}
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
            {limitErrors.length ? (
              <div className="quick-deploy-warning" role="alert">
                {limitErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
                <button type="button" onClick={showAdvanced}>
                  Choose fewer files
                </button>
              </div>
            ) : null}
            {preflight.privatePaths.length ? (
              <p className="quick-deploy-warning" role="status">
                Your selection includes files that may be private.{' '}
                <button type="button" disabled={busy} onClick={showAdvanced}>
                  Review files
                </button>
              </p>
            ) : null}
            <button
              type="button"
              className="button button-coral deploy-button"
              disabled={
                !files.length ||
                !online ||
                limitErrors.length > 0 ||
                phase !== 'idle' ||
                (privateDeploy && deployPassword.length < 8)
              }
              onClick={() => void deploy()}
            >
              {phase === 'idle'
                ? recovery
                  ? 'Resume upload ↗'
                  : 'Deploy now ↗'
                : phase === 'preparing'
                  ? 'Preparing files…'
                  : phase === 'uploading'
                    ? `Uploading ${uploaded}/${uploadTotal || files.length}`
                    : phase === 'done'
                      ? 'Deployed ✓'
                      : 'Going live…'}
            </button>
            {phase === 'done' ? (
              <button
                type="button"
                className="button button-paper"
                onClick={startFreshSite}
              >
                Deploy a new site
              </button>
            ) : null}
            {!online ? (
              <p className="quick-deploy-warning" role="status">
                You’re offline. Your selected files stay here. Reconnect, then
                choose Deploy or Resume upload.
              </p>
            ) : null}
            <p className="quick-deploy-hint">
              {phase === 'done'
                ? 'Drop more files to deploy another update.'
                : 'Want to customize or review first? Open Advanced options below.'}
            </p>
          </div>
          <details ref={advancedOptions} className="deploy-advanced">
            <summary>
              Advanced options{' '}
              <span>Address, privacy, routing, and file review</span>
            </summary>
            <div className="deploy-advanced-content">
              <div className="deploy-controls">
                <label>
                  <span>Site address</span>
                  <div className="slug-input">
                    <input
                      name="site-slug"
                      disabled={phase !== 'idle'}
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
                      disabled={phase !== 'idle'}
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
                    Example: staging creates a no-index site channel without
                    moving production.
                  </small>
                </label>
                <label className="routing-toggle">
                  <input
                    name="spa-fallback"
                    disabled={phase !== 'idle'}
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
                    disabled={phase !== 'idle'}
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
                  className="button button-paper deploy-button"
                  disabled={
                    !files.length ||
                    !online ||
                    limitErrors.length > 0 ||
                    busy ||
                    phase === 'done'
                  }
                  onClick={() => void deploy(true)}
                >
                  Review changes
                </button>
              </div>
              <DeploymentPresets
                userId={user.id}
                settings={{ slug, channel, spaFallback, privateDeploy }}
                disabled={busy}
                onApply={(settings) => {
                  setSlug(settings.slug)
                  setChannel(settings.channel)
                  setSpaFallback(settings.spaFallback)
                  setPrivateDeploy(settings.privateDeploy)
                  setDeployPassword('')
                  setReview(null)
                  setPhase('idle')
                  setError('')
                  setResultUrl('')
                  setResultShareUrl('')
                }}
              />
              {originalFiles.length ? (
                <div className="console-actions">
                  <input
                    ref={additionalInput}
                    name="additional-files"
                    type="file"
                    multiple
                    hidden
                    disabled={busy}
                    onChange={(event) => {
                      const incoming = Array.from(event.target.files ?? []).map(
                        (file) => ({ file, path: file.name }),
                      )
                      if (!incoming.length) return
                      const root = publishRoot
                      selectFiles(
                        mergeUploadFiles(files, incoming),
                        mergeUploadFiles(
                          sourceFiles,
                          incoming.map((item) => ({
                            ...item,
                            path: root ? `${root}/${item.path}` : item.path,
                          })),
                        ),
                      )
                      setOriginalFiles(
                        mergeUploadFiles(originalFiles, incoming),
                      )
                      setPublishRoot(root)
                      event.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    className="button button-paper"
                    disabled={busy}
                    onClick={() => additionalInput.current?.click()}
                  >
                    Add files to selection
                  </button>
                  <small>
                    Matching paths are replaced. Other selected and excluded
                    files stay as they are.
                  </small>
                </div>
              ) : null}
              <details className="console-item">
                <summary>Use these settings in the CLI</summary>
                <p>
                  For Bash or Zsh. Replace the build-folder path and run{' '}
                  <code>yeeet login</code> first. This previews changes; remove{' '}
                  <code>--dry-run</code> to publish. Browser file exclusions are
                  not included: prepare the same files locally or use{' '}
                  <code>.yeeetignore</code>.
                </p>
                {privateDeploy ? (
                  <p>
                    Set <code>YEEET_DEPLOY_PASSWORD</code> securely in your
                    shell. Your browser password is never copied.
                  </p>
                ) : null}
                <pre className="console-code">
                  {deployCommand(data.platform.controlPlaneUrl, {
                    slug,
                    channel,
                    spaFallback,
                    privateDeploy,
                  })}
                </pre>
                <CopyButton
                  className="button button-paper"
                  label="Copy CLI preview command"
                  value={deployCommand(data.platform.controlPlaneUrl, {
                    slug,
                    channel,
                    spaFallback,
                    privateDeploy,
                  })}
                />
              </details>
              {folderChoices.length ? (
                <label className="console-field">
                  Publish folder
                  <select
                    name="publish-folder"
                    value={publishRoot}
                    disabled={busy}
                    onChange={(event) => {
                      const root = event.target.value
                      selectFiles(
                        selectPublishFolder(sourceFiles, root),
                        sourceFiles,
                      )
                      setPublishRoot(root)
                    }}
                  >
                    <option value="">All selected files</option>
                    {folderChoices.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}/
                      </option>
                    ))}
                  </select>
                  <small>
                    Publish only this folder’s contents at the site root. Other
                    files stay out of this deployment.
                  </small>
                </label>
              ) : null}
              {originalFiles.length ? (
                <UploadSelection
                  original={originalFiles}
                  files={files}
                  disabled={phase !== 'idle' && phase !== 'done'}
                  onChange={(next) => {
                    setFiles(next)
                    setReview(null)
                    setPhase('idle')
                    setError('')
                    setResultUrl('')
                    setResultShareUrl('')
                  }}
                />
              ) : null}
              {files.length ? (
                <DeploymentPreflight
                  files={files}
                  spa={spaFallback}
                  disabled={phase !== 'idle' && phase !== 'done'}
                  onExclude={(paths) => {
                    const excluded = new Set(paths)
                    setFiles(files.filter((item) => !excluded.has(item.path)))
                    setReview(null)
                    setPhase('idle')
                    setError('')
                    setResultUrl('')
                    setResultShareUrl('')
                  }}
                />
              ) : null}
              {reviewIsCurrent ? (
                <section
                  className="deployment-review"
                  aria-label="Deployment review"
                >
                  <h3>Review your deployment</h3>
                  <p>
                    {review.targetUrl ?? 'A new generated site address'} ·{' '}
                    {channel
                      ? `${channel} channel; production stays unchanged`
                      : 'Production'}{' '}
                    · {privateDeploy ? 'Password protected' : 'Public'}
                  </p>
                  <ManifestDiff diff={review.diff} />
                  <p>
                    Changes are compared with{' '}
                    {review.baseDeploymentId
                      ? review.baseDeploymentId.slice(0, 8)
                      : 'an empty site'}
                    . A new immutable version will be created.
                  </p>
                </section>
              ) : null}
            </div>
          </details>
          {phase === 'preparing' || phase === 'uploading' ? (
            <div className="console-actions">
              <p role="status">
                {phase === 'preparing'
                  ? `Preparing files: ${hashedCount} / ${files.length}`
                  : `Uploaded ${uploaded} / ${uploadTotal} missing files · ${reused} already stored`}
              </p>
              <button
                className="button button-paper"
                onClick={() => uploadController.current?.abort()}
              >
                Pause upload
              </button>
            </div>
          ) : null}
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
              <CopyButton
                value={resultShareUrl || resultUrl}
                label={resultShareUrl ? 'Copy share link' : 'Copy URL'}
              />
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
              <b>{data.totalCount}</b>
            </div>
            <RecentSites key={user.id} userId={user.id} />
            <SavedViews
              userId={user.id}
              filters={filters}
              onLoad={(saved) =>
                changeFilters({
                  q: undefined,
                  status: undefined,
                  group: undefined,
                  favorites: undefined,
                  ...saved,
                })
              }
            />
            {data.totalCount ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  changeFilters({ q: siteSearch || undefined })
                }}
                className="site-filters"
                role="search"
                aria-label="Find a site"
              >
                <label>
                  <span>Search sites</span>
                  <input
                    type="search"
                    name="site-search"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Site, domain, project, or tag…"
                    value={siteSearch}
                    onChange={(event) => {
                      setSiteSearch(event.target.value)
                    }}
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={siteStatus}
                    onChange={(event) => {
                      changeFilters({
                        status: event.target.value as typeof siteStatus,
                      })
                    }}
                  >
                    <option value="all">All sites</option>
                    <option value="live">Live</option>
                    <option value="inactive">No live version</option>
                  </select>
                </label>
                <label>
                  Project group
                  <select
                    value={projectGroup}
                    onChange={(event) => {
                      changeFilters({ group: event.target.value || undefined })
                    }}
                  >
                    <option value="">All groups</option>
                    {projectGroups.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={favoritesOnly}
                    onChange={(event) => {
                      changeFilters({
                        favorites: event.target.checked || undefined,
                      })
                    }}
                  />
                  Favorites only
                </label>
                <button className="button button-paper" type="submit">
                  Search sites
                </button>
                <p role="status">
                  Showing {matchingSites.length} of {data.matchedCount} matching
                  sites. Newest first.
                </p>
              </form>
            ) : null}
            {data.totalCount ? (
              <div className="site-list">
                {matchingSites.map((site) => (
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
                      <b>
                        {site.organization.favorite ? '★ ' : ''}
                        {site.slug}
                      </b>
                      <small>
                        {site.slug}.{data.platform.siteDomain}
                      </small>
                      <small>
                        {[site.organization.project, ...site.organization.tags]
                          .filter(Boolean)
                          .join(' · ')}
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
                        <svg
                          aria-hidden="true"
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                        >
                          <path d="M5 13 13 5M7 5h6v6" />
                        </svg>
                      </a>
                    </span>
                  </div>
                ))}
                {!matchingSites.length ? (
                  <div className="empty-state">
                    <p>No sites match these filters.</p>
                    <button
                      type="button"
                      className="button button-paper"
                      onClick={() => {
                        setSiteSearch('')
                        changeFilters({
                          q: undefined,
                          status: undefined,
                          group: undefined,
                          favorites: undefined,
                        })
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : null}
                <nav className="console-actions" aria-label="Site pages">
                  {filters.cursor ? (
                    <Link
                      to="/dashboard"
                      search={{ ...filters, cursor: undefined }}
                      resetScroll={false}
                    >
                      First page
                    </Link>
                  ) : null}
                  {data.nextCursor ? (
                    <Link
                      to="/dashboard"
                      search={{ ...filters, cursor: data.nextCursor }}
                      resetScroll={false}
                    >
                      Next page
                    </Link>
                  ) : null}
                </nav>
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
            {keyError ? (
              <p className="form-error" role="alert">
                {keyError}
              </p>
            ) : null}
            {newKey ? (
              <div className="key-reveal">
                <code>{newKey}</code>
                <CopyButton value={newKey} label="Copy key" />
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
            <Link to="/dashboard/settings" className="text-link">
              Manage API keys and webhooks →
            </Link>
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

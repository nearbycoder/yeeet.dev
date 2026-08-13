import { and, eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { customDomains, deploymentFiles, deployments, sites } from '#/db/schema'
import {
  deploymentShareCookieName,
  shareTokenForDeployment,
  verifyDeploymentPassword,
  verifyDeploymentShareToken,
} from './deployment-access'
import { controlPlaneUrl, siteDomain, siteUrl } from './platform-config'
import { displayNameFromSlug, renderSiteSocialImage } from './site-social-image'
import {
  GENERATED_SOCIAL_IMAGE_PATH,
  injectSiteSocialMetadata,
} from './site-social-metadata'
import { getStoredObject } from './storage'

type SiteTarget =
  | { kind: 'live'; label: string; slug: string }
  | { kind: 'version'; deploymentId: string; label: string }
  | { kind: 'custom'; hostname: string; label: string }

function uuidFromVersionLabel(label: string) {
  const match = /^v-([a-f0-9]{32})$/.exec(label)
  if (!match) return null
  const hex = match[1]
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function siteTarget(request: Request): SiteTarget | null {
  const url = new URL(request.url)
  if (process.env.NODE_ENV !== 'production') {
    const override = request.headers.get('x-yeeet-site')
    if (override) {
      const label = override.toLowerCase()
      const deploymentId = uuidFromVersionLabel(label)
      return deploymentId
        ? { kind: 'version', deploymentId, label }
        : {
            kind: 'live',
            slug: label,
            label: new URL(siteUrl(label)).hostname,
          }
    }
  }

  const hostname = url.hostname.toLowerCase()
  const suffix = `.${siteDomain()}`
  if (hostname.endsWith(suffix)) {
    const label = hostname.slice(0, -suffix.length)
    if (!label || label.includes('.')) return null
    const deploymentId = uuidFromVersionLabel(label)
    return deploymentId
      ? { kind: 'version', deploymentId, label: hostname }
      : { kind: 'live', slug: label, label: hostname }
  }

  const platformHost = new URL(controlPlaneUrl()).hostname
  if (
    hostname === platformHost ||
    hostname === process.env.RAILWAY_PUBLIC_DOMAIN ||
    hostname === process.env.RAILWAY_PRIVATE_DOMAIN ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost')
  ) {
    return null
  }
  return { kind: 'custom', hostname, label: hostname }
}

function candidatePaths(pathname: string) {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = pathname
  }
  const clean = decoded.replace(/^\/+/, '').replaceAll('\\', '/')
  if (clean.split('/').includes('..')) return []
  if (!clean || clean.endsWith('/')) return [`${clean}index.html`]
  if (!clean.split('/').at(-1)?.includes('.')) {
    return [clean, `${clean}.html`, `${clean}/index.html`]
  }
  return [clean]
}

export function shouldUseSpaFallback(request: Request, enabled: boolean) {
  if (!enabled) return false
  const segment = new URL(request.url).pathname.split('/').at(-1)
  if (segment?.includes('.')) return false
  const accept = request.headers.get('accept')
  if (accept) return accept.includes('text/html')
  return true
}

export function siteResponsePolicy(
  contentType: string,
  immutableVersion: boolean,
  protectedDeployment: boolean,
) {
  const cacheControl = protectedDeployment
    ? 'private, no-store, max-age=0'
    : immutableVersion
      ? 'public, max-age=31536000, immutable'
      : contentType.includes('text/html')
        ? 'public, max-age=0, s-maxage=10, stale-while-revalidate=30'
        : 'public, max-age=0, s-maxage=10, stale-while-revalidate=30'
  const noCrawl = immutableVersion || protectedDeployment
  return {
    cacheControl,
    xRobotsTag: noCrawl
      ? 'noindex, nofollow, noarchive, nosnippet, noimageindex'
      : null,
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function requestCookie(request: Request, name: string) {
  const cookies = request.headers.get('cookie') ?? ''
  for (const part of cookies.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) {
      try {
        return decodeURIComponent(value.join('='))
      } catch {
        return null
      }
    }
  }
  return null
}

function deploymentAccessCookie(
  request: Request,
  deploymentId: string,
  shareNonce: string,
) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${deploymentShareCookieName(deploymentId)}=${encodeURIComponent(shareTokenForDeployment(deploymentId, shareNonce))}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=2592000`
}

function hasDeploymentAccess(
  request: Request,
  deploymentId: string,
  shareNonce: string,
) {
  const token = requestCookie(request, deploymentShareCookieName(deploymentId))
  return Boolean(
    token && verifyDeploymentShareToken(token, deploymentId, shareNonce),
  )
}

function safeReturnTo(value: FormDataEntryValue | null) {
  return typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//')
    ? value
    : '/'
}

function unlockPage(request: Request, hostname: string, error?: string) {
  const url = new URL(request.url)
  url.searchParams.delete('share')
  const returnTo = `${url.pathname}${url.search}`
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private deployment · Yeeet</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:20px;background:#efebe2;color:#171714;font:15px system-ui,-apple-system,sans-serif}main{width:min(100%,420px);border:1px solid #171714;border-radius:8px;padding:28px;background:#fff;box-shadow:6px 6px 0 #f04d2f}.mark{display:grid;width:46px;height:46px;place-items:center;border-radius:12px;background:#171714;color:#f04d2f;font-size:25px;font-weight:900}h1{margin:24px 0 8px;font-size:32px;letter-spacing:-.05em;text-wrap:balance}p{margin:0 0 22px;color:#67645d;line-height:1.5;overflow-wrap:anywhere}label span{display:block;margin-bottom:7px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}input{width:100%;height:48px;border:1px solid #aaa499;border-radius:4px;padding:0 12px;font:inherit;font-size:16px}input:focus-visible,button:focus-visible{outline:3px solid #171714;outline-offset:3px}button{width:100%;min-height:48px;margin-top:12px;border:1px solid #171714;border-radius:4px;color:#fff;background:#f04d2f;font:inherit;font-weight:800;cursor:pointer;touch-action:manipulation}.error{margin:-8px 0 14px;color:#b52d17;font-weight:700}@media(max-width:420px){main{padding:22px;box-shadow:4px 4px 0 #f04d2f}h1{font-size:28px}}</style></head><body><main><div class="mark">Y!</div><h1>Private deployment.</h1><p>${escapeHtml(hostname)} is password protected. Enter the password shared by its owner.</p>${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}<form method="post" action="/_yeeet/unlock"><input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}"><label><span>Password</span><input type="password" name="password" minlength="8" maxlength="128" autocomplete="current-password" required></label><button type="submit">Open deployment →</button></form></main></body></html>`
  return new Response(request.method === 'HEAD' ? null : body, {
    status: 401,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
      pragma: 'no-cache',
      expires: '0',
      vary: 'cookie',
    },
  })
}

function grantDeploymentAccess(
  request: Request,
  deploymentId: string,
  shareNonce: string,
  location: string,
) {
  return new Response(null, {
    status: 303,
    headers: {
      location,
      'set-cookie': deploymentAccessCookie(request, deploymentId, shareNonce),
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex',
      pragma: 'no-cache',
      expires: '0',
      vary: 'cookie',
    },
  })
}

function notFound(hostname: string, noCrawl = false) {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': noCrawl
      ? 'private, no-store, max-age=0'
      : 'public, max-age=0, s-maxage=30',
  }
  if (noCrawl) {
    headers['x-robots-tag'] =
      'noindex, nofollow, noarchive, nosnippet, noimageindex'
    headers.pragma = 'no-cache'
    headers.expires = '0'
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Not found</title><style>body{margin:0;background:#f4f0e8;color:#171714;font:16px ui-monospace,monospace;display:grid;min-height:100vh;place-items:center}main{max-width:36rem;padding:2rem}.mark{font-size:3rem;font-weight:900;letter-spacing:-.1em}a{color:#f04d2f}</style><main><div class="mark">Y!</div><h1>Nothing landed here.</h1><p>${hostname} exists, but this path doesn't.</p><a href="/">Back to the site →</a></main>`,
    {
      status: 404,
      headers,
    },
  )
}

export async function maybeServeSite(
  request: Request,
): Promise<Response | null> {
  if (new URL(request.url).pathname === '/health') return null
  const target = siteTarget(request)
  if (!target) return null
  const requestUrl = new URL(request.url)
  const isUnlock =
    request.method === 'POST' && requestUrl.pathname === '/_yeeet/unlock'
  if (request.method !== 'GET' && request.method !== 'HEAD' && !isUnlock) {
    return new Response('Method not allowed', { status: 405 })
  }

  let deploymentId: string | null = null
  let siteSlug: string | null = null
  if (target.kind === 'version') {
    deploymentId = target.deploymentId
  } else if (target.kind === 'live') {
    const site = await db.query.sites.findFirst({
      where: eq(sites.slug, target.slug),
    })
    deploymentId = site?.activeDeploymentId ?? null
    siteSlug = site?.slug ?? null
  } else {
    const mappedRows = await db
      .select({
        activeDeploymentId: sites.activeDeploymentId,
        slug: sites.slug,
      })
      .from(customDomains)
      .innerJoin(sites, eq(customDomains.siteId, sites.id))
      .where(eq(customDomains.hostname, target.hostname))
      .limit(1)
    deploymentId = mappedRows.at(0)?.activeDeploymentId ?? null
    siteSlug = mappedRows.at(0)?.slug ?? null
  }
  if (!deploymentId) return notFound(target.label, target.kind === 'version')

  const deployment = await db.query.deployments.findFirst({
    where: and(
      eq(deployments.id, deploymentId),
      eq(deployments.status, 'ready'),
    ),
  })
  if (!deployment) return notFound(target.label, target.kind === 'version')

  if (!siteSlug) {
    const site = await db.query.sites.findFirst({
      where: eq(sites.id, deployment.siteId),
    })
    siteSlug = site?.slug ?? null
  }
  if (!siteSlug) return notFound(target.label, target.kind === 'version')

  if (deployment.passwordHash) {
    const shareToken = requestUrl.searchParams.get('share')
    if (
      shareToken &&
      verifyDeploymentShareToken(
        shareToken,
        deployment.id,
        deployment.shareNonce,
      )
    ) {
      requestUrl.searchParams.delete('share')
      return grantDeploymentAccess(
        request,
        deployment.id,
        deployment.shareNonce,
        `${requestUrl.pathname}${requestUrl.search}${requestUrl.hash}`,
      )
    }

    if (isUnlock) {
      const form = await request.formData()
      const password = form.get('password')
      if (
        typeof password === 'string' &&
        (await verifyDeploymentPassword(password, deployment.passwordHash))
      ) {
        return grantDeploymentAccess(
          request,
          deployment.id,
          deployment.shareNonce,
          safeReturnTo(form.get('returnTo')),
        )
      }
      return unlockPage(request, target.label, 'That password did not match.')
    }

    if (!hasDeploymentAccess(request, deployment.id, deployment.shareNonce)) {
      return unlockPage(request, target.label)
    }
  } else if (isUnlock) {
    return notFound(target.label, target.kind === 'version')
  }

  const protectedDeployment = Boolean(deployment.passwordHash)
  if (requestUrl.pathname === GENERATED_SOCIAL_IMAGE_PATH) {
    const responsePolicy = siteResponsePolicy(
      'image/png',
      target.kind === 'version',
      protectedDeployment,
    )
    const etag = protectedDeployment ? null : `"yeeet-og-${deployment.id}-v1"`
    const headers = new Headers({
      'content-type': 'image/png',
      'cache-control': responsePolicy.cacheControl,
      'content-disposition': `inline; filename="${siteSlug}-social-card.png"`,
      'x-content-type-options': 'nosniff',
      'x-yeeet-deployment': deployment.id,
    })
    if (responsePolicy.xRobotsTag) {
      headers.set('x-robots-tag', responsePolicy.xRobotsTag)
    }
    if (protectedDeployment) {
      headers.set('pragma', 'no-cache')
      headers.set('expires', '0')
      headers.set('vary', 'cookie')
    }
    if (etag) headers.set('etag', etag)
    if (etag && request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }

    try {
      const image = renderSiteSocialImage({
        hostname: target.label,
        slug: siteSlug,
      })
      headers.set('content-length', String(image.byteLength))
      const body = request.method === 'HEAD' ? null : Uint8Array.from(image)
      return new Response(body, { headers })
    } catch (error) {
      console.error('Failed to render site social image', {
        deploymentId: deployment.id,
        site: target.label,
        error,
      })
      return new Response('Social image temporarily unavailable', {
        status: 503,
        headers: { 'cache-control': 'private, no-store' },
      })
    }
  }

  const candidates = candidatePaths(requestUrl.pathname)
  if (!candidates.length)
    return notFound(
      target.label,
      target.kind === 'version' || Boolean(deployment.passwordHash),
    )

  const rows = await db
    .select()
    .from(deploymentFiles)
    .where(
      and(
        eq(deploymentFiles.deploymentId, deploymentId),
        inArray(deploymentFiles.path, [
          ...candidates,
          'index.html',
          '404.html',
        ]),
      ),
    )
  const files = new Map(rows.map((row) => [row.path, row]))
  let file = candidates.map((path) => files.get(path)).find(Boolean)
  let status = 200
  if (!file && shouldUseSpaFallback(request, deployment.spaFallback)) {
    file = files.get('index.html')
  }
  if (!file && files.has('404.html')) {
    file = files.get('404.html')
    status = 404
  }
  if (!file)
    return notFound(
      target.label,
      target.kind === 'version' || Boolean(deployment.passwordHash),
    )

  const injectSocialImage =
    status === 200 && file.contentType.includes('text/html')
  const responsePolicy = siteResponsePolicy(
    file.contentType,
    target.kind === 'version',
    protectedDeployment,
  )
  const etag =
    !protectedDeployment && file.etag
      ? `"${injectSocialImage ? `yeeet-social-v1-${file.etag}` : file.etag}"`
      : undefined
  const headers = new Headers({
    'content-type': file.contentType,
    'cache-control': responsePolicy.cacheControl,
    'x-content-type-options': 'nosniff',
    'x-yeeet-deployment': deploymentId,
    'accept-ranges': 'bytes',
  })
  if (responsePolicy.xRobotsTag) {
    headers.set('x-robots-tag', responsePolicy.xRobotsTag)
  }
  if (protectedDeployment) {
    headers.set('pragma', 'no-cache')
    headers.set('expires', '0')
    headers.set('vary', 'cookie')
  }
  if (etag) headers.set('etag', etag)
  if (etag && request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers })
  }
  if (request.method === 'HEAD') {
    if (injectSocialImage) headers.delete('accept-ranges')
    else headers.set('content-length', String(file.size))
    return new Response(null, { status, headers })
  }

  try {
    const range = injectSocialImage
      ? undefined
      : (request.headers.get('range') ?? undefined)
    const object = await getStoredObject(file.storageKey, range)
    if (injectSocialImage) {
      const originalHtml = (await object.Body?.transformToString()) ?? ''
      const pageUrl = `${requestUrl.origin}${requestUrl.pathname}`
      const body = injectSiteSocialMetadata(originalHtml, {
        hostname: target.label,
        imageUrl: new URL(GENERATED_SOCIAL_IMAGE_PATH, requestUrl.origin).href,
        pageUrl,
        siteName: displayNameFromSlug(siteSlug),
      })
      headers.delete('accept-ranges')
      headers.set('content-length', String(Buffer.byteLength(body)))
      return new Response(body, { status, headers })
    }
    if (object.ContentLength != null) {
      headers.set('content-length', String(object.ContentLength))
    }
    if (object.ContentRange) headers.set('content-range', object.ContentRange)
    const responseStatus = object.ContentRange ? 206 : status
    const body = object.Body?.transformToWebStream()
    return new Response(body as ReadableStream<Uint8Array> | undefined, {
      status: responseStatus,
      headers,
    })
  } catch (error) {
    console.error('Failed to read site object', {
      site: target.label,
      path: file.path,
      error,
    })
    const errorHeaders = new Headers()
    if (target.kind === 'version' || protectedDeployment) {
      errorHeaders.set('cache-control', 'private, no-store, max-age=0')
      errorHeaders.set(
        'x-robots-tag',
        'noindex, nofollow, noarchive, nosnippet, noimageindex',
      )
    }
    return new Response('Asset temporarily unavailable', {
      status: 502,
      headers: errorHeaders,
    })
  }
}

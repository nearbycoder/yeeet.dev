import { z } from 'zod'
import { candidatePaths, shouldUseSpaFallback } from '#/lib/route-resolution'
import { inspectDeployment } from './deployment-inspection'
import {
  deserializeSiteRules,
  matchingRedirect,
  matchingHeaders,
  HEADERS_FILE,
  REDIRECTS_FILE,
} from './site-rules'
import type { SiteHeaderRule, SiteRedirectRule } from './site-rules'
import { GENERATED_SOCIAL_IMAGE_PATH } from './site-social-metadata'

const schema = z.object({
  slug: z.string().min(1).max(63),
  version: z.string().min(8).max(36),
  path: z
    .string()
    .min(1)
    .max(1000)
    .regex(
      /^\/(?!\/)[^\\#]*$/,
      'Enter a local path beginning with /, without a fragment.',
    )
    .refine(
      (path) =>
        [...path].every(
          (char) => char.charCodeAt(0) > 32 && char.charCodeAt(0) !== 127,
        ),
      'Spaces and control characters are not allowed.',
    ),
})
type RoutingVersion = {
  files: Array<{ path: string }>
  spaFallback: boolean
  headerRules: string
  redirectRules: string
}
export function simulateRoute(version: RoutingVersion, path: string) {
  const request = new Request(new URL(path, 'https://simulation.invalid'), {
      headers: { accept: 'text/html' },
    }),
    pathname = new URL(request.url).pathname
  const redirects = deserializeSiteRules<SiteRedirectRule>(
      version.redirectRules,
      [],
    ),
    headers = deserializeSiteRules<SiteHeaderRule>(version.headerRules, [])
  const redirect = matchingRedirect(redirects, pathname)
  const result = {
    requestedPath: pathname,
    effectivePath: pathname,
    status: 404,
    file: null as string | null,
    spa: false,
    redirect: null as { to: string; status: number } | null,
    headers: [] as Array<{ name: string; value: string }>,
    special: false,
  }
  if (pathname === GENERATED_SOCIAL_IMAGE_PATH)
    return { ...result, status: 200, special: true }
  if (redirect && redirect.status !== 200)
    return {
      ...result,
      status: redirect.status,
      redirect: { to: redirect.to, status: redirect.status },
    }
  const effectivePath =
    redirect?.status === 200
      ? new URL(redirect.to, 'https://rewrite.yeeet.invalid').pathname
      : pathname
  result.effectivePath = effectivePath
  if (
    effectivePath === `/${HEADERS_FILE}` ||
    effectivePath === `/${REDIRECTS_FILE}`
  )
    return result
  const candidates = candidatePaths(effectivePath)
  if (!candidates.length) return result
  const files = new Set(version.files.map((file) => file.path))
  let file = candidates.find((candidate) => files.has(candidate))
  let status = 200
  if (
    !file &&
    shouldUseSpaFallback(request, version.spaFallback) &&
    files.has('index.html')
  ) {
    file = 'index.html'
    result.spa = true
  }
  if (!file && files.has('404.html')) {
    file = '404.html'
    status = 404
  }
  if (!file) return result
  return {
    ...result,
    file,
    status,
    headers: matchingHeaders(headers, effectivePath),
  }
}
export async function simulateOwnedRoute(userId: string, input: unknown) {
  const data = schema.parse(input)
  const version = await inspectDeployment(userId, data.slug, data.version)
  return simulateRoute(version, data.path)
}

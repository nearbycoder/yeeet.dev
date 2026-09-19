import { HttpError } from './http'
import { controlPlaneUrl } from './platform-config'

// Hosted content shares a registrable domain but is never a trusted console origin.
export function requireTrustedMutation(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
  const origin = request.headers.get('origin')
  const trusted = controlPlaneUrl()
  if (origin === trusted) return
  if (
    origin ||
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    request.headers.get('sec-fetch-site') === 'same-site'
  ) {
    throw new HttpError(
      403,
      'Use the console to perform this action.',
      'untrusted_origin',
    )
  }
  // CLI and MCP credentials are explicit; cookie-authenticated writes need an origin.
  if (request.headers.has('cookie')) {
    throw new HttpError(
      403,
      'A trusted origin is required for this action.',
      'origin_required',
    )
  }
}

export function initialUserRole(
  email: string,
  emailVerified: boolean,
  allowlist: ReadonlySet<string>,
) {
  return emailVerified && allowlist.has(email.toLowerCase()) ? 'admin' : 'user'
}

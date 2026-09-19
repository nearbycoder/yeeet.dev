import { ownedDeploymentFile } from './deployment-file'
import { getStoredObject } from './storage'
import { HttpError } from './http'

export function fileDownloadHeaders(path: string) {
  const name = path.split('/').pop() || 'download'
  const fallback =
    name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'download'
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
  }
}
export async function downloadDeploymentFile(
  userId: string,
  input: { slug: string; version: string; path: string },
) {
  const file = await ownedDeploymentFile(userId, input)
  const object = await getStoredObject(file.storageKey)
  if (!object.Body)
    throw new HttpError(404, 'Stored file is unavailable.', 'not_found')
  return new Response(object.Body.transformToWebStream(), {
    headers: fileDownloadHeaders(file.path),
  })
}

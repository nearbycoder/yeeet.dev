import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { deploymentFiles, deployments, sites } from '#/db/schema'
import { TEXT_PREVIEW_BYTES, canPreviewText } from '#/lib/text-preview'
import { HttpError } from './http'
import { getStoredObject } from './storage'

export const deploymentFileInput = z.object({
  slug: z.string().min(1).max(63),
  version: z.string().uuid(),
  path: z.string().min(1).max(1024),
})
export async function ownedDeploymentFile(
  userId: string,
  input: z.infer<typeof deploymentFileInput>,
) {
  const clean = deploymentFileInput.parse(input)
  const matches = await db
    .select({
      path: deploymentFiles.path,
      size: deploymentFiles.size,
      contentType: deploymentFiles.contentType,
      storageKey: deploymentFiles.storageKey,
    })
    .from(deploymentFiles)
    .innerJoin(deployments, eq(deploymentFiles.deploymentId, deployments.id))
    .innerJoin(sites, eq(deployments.siteId, sites.id))
    .where(
      and(
        eq(sites.userId, userId),
        eq(sites.slug, clean.slug),
        eq(deployments.id, clean.version),
        eq(deployments.status, 'ready'),
        eq(deploymentFiles.path, clean.path),
      ),
    )
    .limit(1)
  const file = matches.at(0)
  if (!file)
    throw new HttpError(
      404,
      'File not found in this ready version.',
      'not_found',
    )
  return file
}
export async function readPreviewStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const chunks: Array<Uint8Array> = []
  let length = 0
  try {
    while (length < TEXT_PREVIEW_BYTES) {
      const { value, done } = await reader.read()
      if (done) break
      const part = value.subarray(0, TEXT_PREVIEW_BYTES - length)
      chunks.push(part)
      length += part.length
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const bytes = Buffer.concat(chunks)
  if (bytes.includes(0))
    throw new HttpError(415, 'This file contains binary data.', 'binary_file')
  return new TextDecoder().decode(bytes)
}
export async function previewDeploymentFile(
  userId: string,
  input: z.infer<typeof deploymentFileInput>,
) {
  const file = await ownedDeploymentFile(userId, input)
  if (!canPreviewText(file.contentType))
    throw new HttpError(
      415,
      'Text preview is unavailable for this file type.',
      'unsupported_preview',
    )
  if (!file.size) return { path: file.path, text: '', truncated: false }
  const object = await getStoredObject(
    file.storageKey,
    `bytes=0-${TEXT_PREVIEW_BYTES - 1}`,
  )
  if (!object.Body)
    throw new HttpError(404, 'Stored file is unavailable.', 'not_found')
  return {
    path: file.path,
    text: await readPreviewStream(object.Body.transformToWebStream()),
    truncated: file.size > TEXT_PREVIEW_BYTES,
  }
}

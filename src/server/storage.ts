import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { HttpError } from './http'

type StorageContext = {
  bucket: string
  client: S3Client
}

let cachedStorage: { cacheKey: string; value: StorageContext } | undefined

function required(name: string, fallback?: string) {
  const value =
    process.env[name] ?? (fallback ? process.env[fallback] : undefined)
  if (!value) {
    throw new HttpError(
      503,
      `Storage is not configured (${name} is missing).`,
      'storage_unavailable',
    )
  }
  return value
}

export function getStorage(): StorageContext {
  const endpoint = required('S3_ENDPOINT', 'ENDPOINT')
  const bucket = required('S3_BUCKET', 'BUCKET')
  const accessKeyId = required('S3_ACCESS_KEY_ID', 'ACCESS_KEY_ID')
  const secretAccessKey = required('S3_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY')
  const region = process.env.S3_REGION ?? process.env.REGION ?? 'auto'
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true'
  const cacheKey = [endpoint, bucket, accessKeyId, region, forcePathStyle].join(
    '|',
  )

  if (cachedStorage?.cacheKey === cacheKey) return cachedStorage.value

  const value = {
    bucket,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
  cachedStorage = { cacheKey, value }
  return value
}

export async function createUploadUrl(input: {
  key: string
  contentType: string
  deploymentId: string
}) {
  const { bucket, client } = getStorage()
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      ContentType: input.contentType,
      Metadata: { deployment: input.deploymentId },
    }),
    { expiresIn: 30 * 60 },
  )
}

export async function headStoredObject(key: string) {
  const { bucket, client } = getStorage()
  return client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
}

export async function getStoredObject(key: string, range?: string) {
  const { bucket, client } = getStorage()
  return client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }),
  )
}

export async function deleteStoredPrefix(prefix: string) {
  const { bucket, client } = getStorage()
  let continuationToken: string | undefined
  let deleted = 0
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    const objects = (page.Contents ?? []).flatMap((object) =>
      object.Key ? [{ Key: object.Key }] : [],
    )
    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects, Quiet: true },
        }),
      )
      deleted += objects.length
    }
    continuationToken = page.NextContinuationToken
  } while (continuationToken)
  return deleted
}

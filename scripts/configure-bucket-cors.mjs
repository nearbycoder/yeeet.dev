import process from 'node:process'
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from '@aws-sdk/client-s3'

function env(primary, fallback) {
  const value = process.env[primary] || process.env[fallback]
  if (!value) throw new Error(`${primary} is required.`)
  return value
}

const bucket = env('S3_BUCKET', 'BUCKET')
const client = new S3Client({
  endpoint: env('S3_ENDPOINT', 'ENDPOINT'),
  region: process.env.S3_REGION || process.env.REGION || 'auto',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  credentials: {
    accessKeyId: env('S3_ACCESS_KEY_ID', 'ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY', 'SECRET_ACCESS_KEY'),
  },
})

const origins = [
  ...new Set(
    (
      process.env.S3_CORS_ORIGINS ||
      `${process.env.BETTER_AUTH_URL || 'https://yeeet.dev'},http://localhost:3000`
    )
      .split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ),
]

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['PUT', 'HEAD'],
          AllowedHeaders: ['content-type', 'x-amz-*'],
          ExposeHeaders: ['etag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
)

const result = await client.send(new GetBucketCorsCommand({ Bucket: bucket }))
if (!result.CORSRules?.length) throw new Error('Bucket CORS did not persist.')
console.log(`Bucket CORS configured for ${origins.join(', ')}.`)

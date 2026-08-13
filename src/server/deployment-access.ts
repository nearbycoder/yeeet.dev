import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { HttpError } from './http'

const SCRYPT_KEY_LENGTH = 32
const SCRYPT_COST = 16_384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1

function shareSecret() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new HttpError(
      503,
      'Private sharing is not configured yet.',
      'private_sharing_unavailable',
    )
  }
  return secret
}

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      SCRYPT_KEY_LENGTH,
      {
        N: SCRYPT_COST,
        r: SCRYPT_BLOCK_SIZE,
        p: SCRYPT_PARALLELIZATION,
        maxmem: 64 * 1024 * 1024,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

export function validateDeploymentPassword(value: unknown) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw new HttpError(
      400,
      'Deployment passwords must be 8–128 characters.',
      'invalid_deployment_password',
    )
  }
  return value
}

export async function hashDeploymentPassword(value: unknown) {
  const password = validateDeploymentPassword(value)
  const salt = randomBytes(16)
  const key = await derivePassword(password, salt)
  return [
    'scrypt',
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$')
}

export async function verifyDeploymentPassword(
  password: string,
  encoded: string,
) {
  const [algorithm, cost, blockSize, parallelization, saltValue, keyValue] =
    encoded.split('$')
  if (
    algorithm !== 'scrypt' ||
    Number(cost) !== SCRYPT_COST ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION ||
    !saltValue ||
    !keyValue
  ) {
    return false
  }
  try {
    const expected = Buffer.from(keyValue, 'base64url')
    const actual = await derivePassword(
      password,
      Buffer.from(saltValue, 'base64url'),
    )
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    )
  } catch {
    return false
  }
}

export function generateShareNonce() {
  return randomBytes(18).toString('base64url')
}

export function shareTokenForDeployment(
  deploymentId: string,
  shareNonce: string,
) {
  const signature = createHmac('sha256', shareSecret())
    .update(`yeeet-share:${deploymentId}:${shareNonce}`)
    .digest('base64url')
  return `${deploymentId}.${shareNonce}.${signature}`
}

export function verifyDeploymentShareToken(
  value: string,
  deploymentId: string,
  shareNonce: string,
) {
  const expected = shareTokenForDeployment(deploymentId, shareNonce)
  const received = Buffer.from(value)
  const expectedBuffer = Buffer.from(expected)
  return (
    received.length === expectedBuffer.length &&
    timingSafeEqual(received, expectedBuffer)
  )
}

export function deploymentShareCookieName(deploymentId: string) {
  return `yeeet_share_${deploymentId.replaceAll('-', '')}`
}

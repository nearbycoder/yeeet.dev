// Signed context shared by the Yeeet gateway and the backend runtime.
// src/server/backend-runtime.ts implements the same format for the gateway.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const CONTEXT_HEADER = 'x-yeeet-runtime-context'
export const SIGNATURE_HEADER = 'x-yeeet-runtime-signature'
export const MAX_CLOCK_SKEW_MS = 60_000

function signature(secret, encoded) {
  return createHmac('sha256', secret).update(encoded).digest('hex')
}

export function signContext(secret, context, now = Date.now()) {
  const encoded = Buffer.from(JSON.stringify({ ...context, ts: now })).toString(
    'base64url',
  )
  return {
    [CONTEXT_HEADER]: encoded,
    [SIGNATURE_HEADER]: signature(secret, encoded),
  }
}

export function verifyContext(secret, headers, now = Date.now()) {
  const encoded = headers.get(CONTEXT_HEADER)
  const received = headers.get(SIGNATURE_HEADER)
  if (!encoded || !received || encoded.length > 16_384) return null
  const expected = Buffer.from(signature(secret, encoded))
  const actual = Buffer.from(received)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null
  let context
  try {
    context = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !context ||
    typeof context !== 'object' ||
    typeof context.ts !== 'number' ||
    Math.abs(now - context.ts) > MAX_CLOCK_SKEW_MS
  )
    return null
  return context
}

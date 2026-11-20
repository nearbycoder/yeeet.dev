import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'request_error',
    public details?: unknown,
  ) {
    super(message)
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export async function readJsonBody(
  request: Request,
  options: { optional?: boolean } = {},
): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (!text.trim()) {
    if (options.optional) return {}
    throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'invalid_json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(
      400,
      'Request body must be a JSON object.',
      'invalid_json',
    )
  }
  return parsed as Record<string, unknown>
}

export function pgErrorInfo(error: unknown): {
  code?: string
  constraint?: string
} {
  const queue: Array<unknown> = [error]
  const seen = new Set<unknown>()
  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    const record = current as {
      code?: unknown
      constraint?: unknown
      cause?: unknown
    }
    if (typeof record.code === 'string') {
      return {
        code: record.code,
        constraint:
          typeof record.constraint === 'string' ? record.constraint : undefined,
      }
    }
    if (record.cause) queue.push(record.cause)
  }
  return {}
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status },
    )
  }

  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: 'validation_error',
          message: error.issues[0]?.message || 'Invalid request input.',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      { status: 400 },
    )
  }

  if (error instanceof SyntaxError) {
    return json(
      {
        error: {
          code: 'invalid_json',
          message: 'Request body must be valid JSON.',
        },
      },
      { status: 400 },
    )
  }

  console.error(error)
  return json(
    { error: { code: 'internal_error', message: 'Something went sideways.' } },
    { status: 500 },
  )
}

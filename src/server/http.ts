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

  console.error(error)
  return json(
    { error: { code: 'internal_error', message: 'Something went sideways.' } },
    { status: 500 },
  )
}

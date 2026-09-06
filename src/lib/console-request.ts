import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'

export async function requestJson<T = unknown>(
  url: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const result = await response.json()
  if (!response.ok)
    throw new Error(result.error?.message || 'The request failed. Try again.')
  return result as T
}

export function useConsoleMutation() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function run(
    action: () => Promise<unknown>,
    message = 'Changes saved.',
  ) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      await router.invalidate()
      setNotice(message)
      return true
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not save changes. Try again.',
      )
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, notice, run }
}
